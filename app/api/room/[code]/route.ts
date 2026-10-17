import { NextResponse } from "next/server";
import { newId, newToken } from "@/lib/code";
import { cleanParams } from "@/lib/chat";
import { assertEndpointShape } from "@/lib/endpoint";
import {
  MAX_PLAYERS,
  addPlayer,
  advance,
  finishDrawing,
  nextRound,
  playerById,
  playerByToken,
  publicRoom,
  startGame,
  transitionDue,
  type Room,
} from "@/lib/room";
import { getRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 700_000;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

/** The whole room, minus every secret. This is what a browser polls. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const token = new URL(req.url).searchParams.get("p") ?? "";

  const room = await getRoom(code);
  if (!room) return fail("没有这个房间。", 404);
  const me = playerByToken(room, token);
  if (!me) return fail("你不在这个房间里。", 403);

  // Phases that only end on a clock are moved on here, lazily, on read.
  if (transitionDue(room, Date.now())) {
    const moved = await withRoomLock(code, (r) => (r && transitionDue(r, Date.now()) ? advance(r, Date.now()) : null));
    if (moved) return NextResponse.json(publicRoom(moved, me.id), { headers: noStore });
  }
  return NextResponse.json(publicRoom(room, me.id), { headers: noStore });
}

type Body = {
  action?: unknown;
  token?: unknown;
  name?: unknown;
  endpoint?: unknown;
  model?: unknown;
  params?: unknown;
  image?: unknown;
  round?: unknown;
};

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "join") return join(code, body);
  if (!action) return fail("没有指定操作。");

  const token = typeof body?.token === "string" ? body.token : "";
  const room = await getRoom(code);
  if (!room) return fail("没有这个房间。", 404);
  const me = playerByToken(room, token);
  if (!me) return fail("你不在这个房间里。", 403);

  if (action === "start") {
    if (room.phase !== "lobby") return NextResponse.json(publicRoom(room, me.id), { headers: noStore });
    if (room.players[0]?.id !== me.id) return fail("只有房主能开始。", 403);
    const next = await withRoomLock(code, (r) => (r && r.phase === "lobby" ? startGame(r, Date.now()) : null));
    return NextResponse.json(publicRoom(next ?? room, me.id), { headers: noStore });
  }

  if (action === "done") {
    if (room.phase !== "drawing" || room.drawerId !== me.id) {
      return NextResponse.json(publicRoom(room, me.id), { headers: noStore });
    }
    const image = typeof body?.image === "string" && body.image.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(body.image) ? body.image : null;
    const next = await withRoomLock(code, (r) =>
      r && r.phase === "drawing" && r.drawerId === me.id ? finishDrawing(r, Date.now(), image) : null,
    );
    return NextResponse.json(publicRoom(next ?? room, me.id), { headers: noStore });
  }

  if (action === "ink") {
    // Best effort live preview for the people watching. A dropped frame is fine.
    if (room.phase !== "drawing" || room.drawerId !== me.id) return NextResponse.json({ ok: false }, { headers: noStore });
    const image = typeof body?.image === "string" && body.image.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(body.image) ? body.image : "";
    if (!image) return fail("预览图不对。");
    await withRoomLock(code, (r) => {
      if (!r || r.phase !== "drawing" || r.drawerId !== me.id) return null;
      return { ...r, image, rev: r.rev + 1 };
    });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  if (action === "next") {
    if (room.phase !== "reveal") return NextResponse.json(publicRoom(room, me.id), { headers: noStore });
    const round = typeof body?.round === "number" ? body.round : null;
    const next = await withRoomLock(code, (r) => {
      if (!r || r.phase !== "reveal") return null;
      // Two players pressing "next" at once must not skip a round.
      if (round !== null && r.round !== round) return null;
      return nextRound(r, Date.now());
    });
    return NextResponse.json(publicRoom(next ?? room, me.id), { headers: noStore });
  }

  return fail("未知操作。");
}

async function join(code: string, body: Body | null) {
  const token = typeof body?.token === "string" ? body.token : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 20) : "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim().slice(0, 300) : "";
  const model = typeof body?.model === "string" ? body.model.trim().slice(0, 80) : "";

  // A browser that already holds a seat just takes it back.
  if (token) {
    const room = await getRoom(code);
    if (!room) return fail("没有这个房间。", 404);
    const me = playerByToken(room, token);
    if (me) return NextResponse.json({ playerId: me.id, token: me.token }, { headers: noStore });
  }

  if (!name || !endpoint || !model) return fail("名字、接口地址、模型 ID 都要填。");
  try {
    assertEndpointShape(endpoint);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "接口地址不对。");
  }

  const player = {
    id: newId(),
    token: newToken(),
    name,
    endpoint,
    model,
    params: cleanParams(body?.params),
    score: 0,
    joinedAt: Date.now(),
  };
  // A holder rather than a captured `let`: TypeScript's flow analysis cannot see
  // writes made inside the callback and would narrow the variable to null.
  const state: { error: string | null; status: number } = { error: null, status: 409 };

  const next = await withRoomLock(code, (r): Room | null => {
    if (!r) {
      state.error = "没有这个房间。";
      state.status = 404;
      return null;
    }
    if (r.phase !== "lobby") {
      state.error = "这局已经开始了。";
      return null;
    }
    if (r.players.length >= MAX_PLAYERS) {
      state.error = `房间满了（最多 ${MAX_PLAYERS} 人）。`;
      return null;
    }
    if (r.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      state.error = "房间里已经有人用这个名字了。";
      return null;
    }
    return addPlayer(r, player);
  });

  if (state.error) return fail(state.error, state.status);
  if (!next || !playerById(next, player.id)) return fail("加入失败。", 409);
  return NextResponse.json({ playerId: player.id, token: player.token }, { headers: noStore });
}
