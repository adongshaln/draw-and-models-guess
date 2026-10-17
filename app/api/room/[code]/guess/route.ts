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
  if (!apiKey) return fail("No API key.");

  const room = await getRoom(code);
  if (!room) return fail("No such room.", 404);
  const me = playerByToken(room, token);
  if (!me) return fail("You are not in this room.", 403);

  if (room.phase !== "guessing") return fail("Nobody is guessing right now.", 409);
  if (!room.image) return fail("There is no drawing to look at.", 409);
  if (solvedBy(room, me.id)) return fail("You already got it.", 409);
  const mine = guessesBy(room, me.id);
  if (mine.length >= MAX_ATTEMPTS) return fail("That was your third look.", 409);

  let endpoint: URL;
  try {
    endpoint = await assertSafeEndpoint(me.endpoint);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Bad endpoint.");
  }

  let raw: string;
  let latencyMs: number;
  try {
    const out = await askModel({
      endpoint: endpoint.toString(),
      apiKey,
      model: me.model,
      image: room.image,
      wrong: mine.filter((g) => g.verdict !== "correct").map((g) => g.text),
      signal: req.signal,
    });
    raw = out.text;
    latencyMs = out.latencyMs;
  } catch (e) {
    const message = e instanceof Error ? e.message : "The model call failed.";
    return NextResponse.json({ error: message, latencyMs: 0 }, { status: 502, headers: noStore });
  }

  const text = cleanGuess(raw) || raw.trim().slice(0, 40).toLowerCase();
  const verdict = judgeGuess(text, room.word ?? "");

  // The attempt number and the points are decided by the server from its own
  // record, never from anything the browser sent.
  const updated = await withRoomLock(code, (r) => {
    if (!r || r.phase !== "guessing") return null;
    return recordGuess(r, me.id, text, verdict, Date.now(), newId());
  });

  const after = updated ? guessesBy(updated, me.id) : [];
  const attempt = after.length || mine.length + 1;
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
