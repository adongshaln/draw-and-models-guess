/**
 * Room storage.
 *
 * Production: Upstash Redis over REST (or Vercel KV, which is the same API),
 * opted into by env presence. Local dev: a process-local map that persists to
 * .data/rooms.json, so a room survives a restart with nothing to install.
 *
 * Writes go through a short-lived lock key. Two players pressing "done" at the
 * same instant is a real race, and a read-modify-write of one JSON blob without
 * a lock loses one of them.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOM_TTL_SECONDS, type Room } from "@/lib/room";

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const remote = Boolean(REST_URL && REST_TOKEN);

const FILE = path.join(process.cwd(), ".data", "rooms.json");
const LOCK_TTL_SECONDS = 10;

async function cmd(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(`${REST_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

/* ---------------- local fallback ---------------- */

type Entry = { v: string; exp: number };
const g = globalThis as unknown as { __damgRooms?: Map<string, Entry>; __damgSave?: NodeJS.Timeout };

function mem(): Map<string, Entry> {
  if (!g.__damgRooms) {
    g.__damgRooms = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, Entry>;
      for (const [k, e] of Object.entries(raw)) if (e.exp > Date.now()) g.__damgRooms.set(k, e);
    } catch {
      /* first run, or a read-only disk */
    }
  }
  return g.__damgRooms;
}

function persist() {
  if (g.__damgSave) return;
  g.__damgSave = setTimeout(() => {
    g.__damgSave = undefined;
    try {
      const out: Record<string, Entry> = {};
      for (const [k, e] of mem()) if (e.exp > Date.now()) out[k] = e;
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(out));
    } catch {
      /* read-only disk: stay in memory */
    }
  }, 500);
}

/* ---------------- the verbs ---------------- */

async function kvGet(key: string): Promise<string | null> {
  if (remote) {
    const r = await cmd(["GET", key]);
    return typeof r === "string" ? r : null;
  }
  const e = mem().get(key);
  if (!e) return null;
  if (e.exp <= Date.now()) {
    mem().delete(key);
    return null;
  }
  return e.v;
}

async function kvSet(key: string, value: string, ttl: number): Promise<void> {
  if (remote) {
    await cmd(["SET", key, value, "EX", ttl]);
    return;
  }
  mem().set(key, { v: value, exp: Date.now() + ttl * 1000 });
  persist();
}

/** SET NX EX: true only for the caller that created the key. */
async function kvClaim(key: string, ttl: number): Promise<boolean> {
  if (remote) {
    const r = await cmd(["SET", key, "1", "NX", "EX", ttl]);
    return r === "OK";
  }
  const e = mem().get(key);
  if (e && e.exp > Date.now()) return false;
  mem().set(key, { v: "1", exp: Date.now() + ttl * 1000 });
  return true;
}

async function kvDel(key: string): Promise<void> {
  if (remote) {
    await cmd(["DEL", key]);
    return;
  }
  mem().delete(key);
}

const roomKey = (code: string) => `damg:room:${code.toUpperCase()}`;

export async function getRoom(code: string): Promise<Room | null> {
  const raw = await kvGet(roomKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Room;
  } catch {
    return null;
  }
}

export async function saveRoom(room: Room): Promise<void> {
  await kvSet(roomKey(room.code), JSON.stringify(room), ROOM_TTL_SECONDS);
}

/** Create only if the code is free. */
export async function createRoom(room: Room): Promise<boolean> {
  const key = roomKey(room.code);
  if (await kvClaim(key, ROOM_TTL_SECONDS)) {
    await saveRoom(room);
    return true;
  }
  return false;
}

/**
 * Read, mutate and write one room while nobody else can. The callback gets the
 * current room (or null) and returns the room to store, or null to leave it be.
 * Never hold this across a model call: the lock is 10s and a call can take 25.
 */
export async function withRoomLock(code: string, fn: (room: Room | null) => Promise<Room | null>): Promise<Room | null> {
  const lockKey = `${roomKey(code)}:lock`;
  let held = false;
  for (let i = 0; i < 40 && !held; i++) {
    held = await kvClaim(lockKey, LOCK_TTL_SECONDS);
    if (!held) await new Promise((r) => setTimeout(r, 25));
  }
  if (!held) return getRoom(code);
  try {
    const current = await getRoom(code);
    const next = await fn(current);
    if (next) await saveRoom(next);
    return next ?? current;
  } finally {
    await kvDel(lockKey).catch(() => undefined);
  }
}
