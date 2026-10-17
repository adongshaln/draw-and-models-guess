import { NextResponse } from "next/server";
import { newCode, newId, newToken } from "@/lib/code";
import { assertEndpointShape } from "@/lib/endpoint";
import type { Room } from "@/lib/room";
import { createRoom } from "@/lib/store";

export const runtime = "nodejs";

type Body = { name?: unknown; endpoint?: unknown; model?: unknown };

const noStore = { "Cache-Control": "no-store" };

/** Open a room. The creator is the host and the first artist. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 20) : "";
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim().slice(0, 300) : "";
  const model = typeof body?.model === "string" ? body.model.trim().slice(0, 80) : "";

  if (!name || !endpoint || !model) {
    return NextResponse.json({ error: "A name, an endpoint and a model are all required." }, { status: 400, headers: noStore });
  }
  try {
    assertEndpointShape(endpoint);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad endpoint." }, { status: 400, headers: noStore });
  }

  const host = {
    id: newId(),
    token: newToken(),
    name,
    endpoint,
    model,
    score: 0,
    joinedAt: Date.now(),
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const room: Room = {
      code: newCode(),
      rev: 1,
      createdAt: Date.now(),
      phase: "lobby",
      round: 1,
      drawerId: host.id,
      word: null,
      deadline: null,
      image: null,
      players: [host],
      guesses: [],
      history: [],
    };
    if (await createRoom(room)) {
      return NextResponse.json({ code: room.code, playerId: host.id, token: host.token }, { headers: noStore });
    }
  }

  return NextResponse.json({ error: "Could not open a room. Try again." }, { status: 503, headers: noStore });
}
