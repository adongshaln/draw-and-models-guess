import { NextResponse } from "next/server";
import { askModel } from "@/lib/chat";
import { assertSafeEndpoint } from "@/lib/endpoint";
import { cleanGuess, judgeGuess } from "@/lib/judge";
import { MAX_ATTEMPTS, guessesBy, playerByToken, pointsFor, recordGuess, solvedBy } from "@/lib/room";
import { getRoom, withRoomLock } from "@/lib/store";
import { newId } from "@/lib/code";

export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

/**
 * One look by one player's model.
 *
 * The caller supplies nothing but their seat token and their own API key. The
 * endpoint, the model id and the picture all come from the room, so a player
 * cannot point the proxy somewhere new, and cannot feed their model anything
 * other than what the artist actually drew.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { token?: unknown; apiKey?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return fail("没有 API 密钥。");

  const room = await getRoom(code);
  if (!room) return fail("没有这个房间。", 404);
  const me = playerByToken(room, token);
  if (!me) return fail("你不在这个房间里。", 403);

  if (room.phase !== "guessing") return fail("现在没人在猜。", 409);
  if (!room.image) return fail("没有可看的画。", 409);
  if (solvedBy(room, me.id)) return fail("你已经猜中了。", 409);
  const mine = guessesBy(room, me.id);
  if (mine.length >= MAX_ATTEMPTS) return fail("三次机会用完了。", 409);

  let endpoint: URL;
  try {
    endpoint = await assertSafeEndpoint(me.endpoint);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "接口地址不对。");
  }

  let raw = "";
  let latencyMs = 0;
  try {
    const out = await askModel({
      endpoint: endpoint.toString(),
      apiKey,
      model: me.model,
      image: room.image,
      wrong: mine.filter((g) => g.verdict !== "correct").map((g) => g.text),
      params: me.params,
      signal: req.signal,
    });
    raw = out.text;
    latencyMs = out.latencyMs;
  } catch (e) {
    const message = e instanceof Error ? e.message : "模型调用失败。";
    return NextResponse.json({ error: message, latencyMs: 0 }, { status: 502, headers: noStore });
  }

  const text = cleanGuess(raw) || raw.trim().slice(0, 40).toLowerCase();
  const verdict = judgeGuess(text, room.word ?? "");

  // The attempt number and the points are decided by the server from its own
  // record, never from anything the browser sent.
  const updated = await withRoomLock(code, (r) => {
    if (!r || r.phase !== "guessing") return null;
    return recordGuess(r, me.id, text, verdict, Date.now(), newId(), latencyMs);
  });

  const after = updated ? guessesBy(updated, me.id) : [];
  // 没写进去就别说猜过了：锁没抢到，或者这一轮刚好结束。让客户端重试或停下。
  if (after.length <= mine.length) return fail("这一轮已经结束了，或者服务器正忙。", 409);
  const attempt = after.length;
  return NextResponse.json(
    {
      text,
      verdict,
      attempt,
      points: verdict === "correct" ? pointsFor(attempt) : 0,
      latencyMs,
    },
    { headers: noStore },
  );
}
