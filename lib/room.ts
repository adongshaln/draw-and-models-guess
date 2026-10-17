import type { Verdict } from "@/lib/judge";
import { pickWord } from "@/lib/words";

/**
 * The room is the whole game. It is one JSON object that every player's browser
 * polls, and every transition below is a pure function of (room, now) so the
 * server can apply it lazily on read and two instances can never disagree.
 */
export const MAX_PLAYERS = 8;
export const MAX_ATTEMPTS = 3;
/** A drawing phase nobody finishes ends on its own. */
export const DRAW_SECONDS = 150;
/** 三次模型调用，每次最长 25 秒；窗口给够，别让慢模型输在等不起上。 */
export const GUESS_SECONDS = 120;
/** A room is disposable. */
export const ROOM_TTL_SECONDS = 6 * 60 * 60;

export type Phase = "lobby" | "drawing" | "guessing" | "reveal" | "over";

export type Player = {
  id: string;
  /** Secret. Never leaves the server. */
  token: string;
  name: string;
  /** Base URL of an OpenAI-compatible API, e.g. https://api.together.xyz/v1 */
  endpoint: string;
  model: string;
  /** Extra request fields from the preset: the thinking switch, and a token budget. */
  params?: Record<string, unknown>;
  score: number;
  joinedAt: number;
};

export type Guess = {
  id: string;
  playerId: string;
  attempt: number;
  text: string;
  verdict: Verdict;
  at: number;
  /** 服务端自己掐的模型响应时间，用来评"这一轮谁答得最快"。 */
  ms: number;
};

export type RoundRecord = {
  round: number;
  drawerId: string;
  word: string;
  solvers: { playerId: string; attempt: number; points: number }[];
};

/** 这一轮谁没答出来、为什么。存在房间里，所有人看得见，也跟着房间一起销毁。 */
export type RoomError = { playerId: string; at: number; message: string };

export type Room = {
  code: string;
  /** Bumped on every write, so a client can tell whether it is looking at news. */
  rev: number;
  createdAt: number;
  phase: Phase;
  /** 1-based. The drawer of round N is players[(N - 1) % players.length]. */
  round: number;
  drawerId: string;
  word: string | null;
  deadline: number | null;
  /** The drawing, as a PNG data URL. */
  image: string | null;
  players: Player[];
  guesses: Guess[];
  history: RoundRecord[];
  errors?: RoomError[];
};

/** Points for solving on the first, second or third look. */
export function pointsFor(attempt: number): number {
  if (attempt <= 1) return 3;
  if (attempt === 2) return 2;
  return 1;
}

export function playerById(room: Room, id: string): Player | undefined {
  return room.players.find((p) => p.id === id);
}

export function playerByToken(room: Room, token: string): Player | undefined {
  return token ? room.players.find((p) => p.token === token) : undefined;
}

export function guessesBy(room: Room, playerId: string): Guess[] {
  return room.guesses.filter((g) => g.playerId === playerId);
}

export function solvedBy(room: Room, playerId: string): Guess | undefined {
  return room.guesses.find((g) => g.playerId === playerId && g.verdict === "correct");
}

/** Everyone has either solved it or spent all three looks. */
export function allDone(room: Room): boolean {
  return room.players.every((p) => solvedBy(room, p.id) !== undefined || guessesBy(room, p.id).length >= MAX_ATTEMPTS);
}

/** The drawer of the current round, whoever that is. */
export function drawer(room: Room): Player | undefined {
  return playerById(room, room.drawerId);
}

function clone(room: Room): Room {
  return { ...room, players: room.players.map((p) => ({ ...p })), guesses: [...room.guesses], history: [...room.history] };
}

export function addPlayer(room: Room, player: Player): Room {
  const next = clone(room);
  next.players.push(player);
  next.rev++;
  return next;
}

/** Lobby to the first drawing turn. */
export function startGame(room: Room, now: number, word = pickWord().word): Room {
  const next = clone(room);
  next.phase = "drawing";
  next.round = 1;
  next.drawerId = room.players[0].id;
  next.word = word;
  next.deadline = now + DRAW_SECONDS * 1000;
  next.guesses = [];
  next.history = [];
  next.errors = [];
  next.image = null;
  next.rev++;
  return next;
}

/** The artist says they are done (or ran out of time). */
export function finishDrawing(room: Room, now: number, image?: string | null): Room {
  const next = clone(room);
  next.phase = "guessing";
  if (image) next.image = image;
  next.deadline = now + GUESS_SECONDS * 1000;
  next.rev++;
  return next;
}

/**
 * One judged look. The attempt number is derived from the server's own record,
 * never from the client, and the points are written here and nowhere else.
 */
export function recordGuess(
  room: Room,
  playerId: string,
  text: string,
  verdict: Verdict,
  now: number,
  id: string,
  ms = 0,
): Room {
  const player = playerById(room, playerId);
  if (!player) return room;
  const mine = guessesBy(room, playerId);
  if (mine.length >= MAX_ATTEMPTS) return room;
  if (solvedBy(room, playerId)) return room;

  const next = clone(room);
  const attempt = mine.length + 1;
  next.guesses.push({ id, playerId, attempt, text, verdict, at: now, ms });
  const me = next.players.find((p) => p.id === playerId)!;
  if (verdict === "correct") {
    me.score += pointsFor(attempt);
    // A drawing good enough to be guessed is worth something to the artist,
    // but not when the artist's own model is the one guessing.
    if (next.drawerId !== playerId) {
      const artist = next.players.find((p) => p.id === next.drawerId);
      if (artist) artist.score += 1;
    }
  }
  next.rev++;
  return next;
}

/** 记下这一次为什么没答出来，给同一间房的其他人也看得见。 */
export function noteError(room: Room, playerId: string, message: string, now: number): Room {
  const next = clone(room);
  next.errors = [...(room.errors ?? []), { playerId, at: now, message: message.slice(0, 160) }].slice(-12);
  next.rev++;
  return next;
}

export function reveal(room: Room, now: number): Room {
  const next = clone(room);
  next.phase = "reveal";
  next.deadline = null;
  const solvers = room.players
    .map((p) => {
      const hit = solvedBy(room, p.id);
      return hit ? { playerId: p.id, attempt: hit.attempt, points: pointsFor(hit.attempt) } : null;
    })
    .filter((x): x is { playerId: string; attempt: number; points: number } => x !== null);

  // 一个都没猜中，画手扣一分：画得让人看不懂是有代价的。
  if (solvers.length === 0) {
    const artist = next.players.find((p) => p.id === room.drawerId);
    if (artist) artist.score -= 1;
  }

  next.history = [...room.history, { round: room.round, drawerId: room.drawerId, word: room.word ?? "", solvers }];
  next.rev++;
  return next;
}

/** Reveal to the next artist, or to the final board once everyone has drawn. */
export function nextRound(room: Room, now: number, word = pickWord(room.history.map((h) => h.word)).word): Room {
  if (room.round >= room.players.length) {
    const done = clone(room);
    done.phase = "over";
    done.deadline = null;
    done.word = room.word;
    done.rev++;
    return done;
  }
  const next = clone(room);
  next.phase = "drawing";
  next.round = room.round + 1;
  next.drawerId = room.players[(next.round - 1) % room.players.length].id;
  next.word = word;
  next.deadline = now + DRAW_SECONDS * 1000;
  next.guesses = [];
  next.errors = [];
  next.image = null;
  next.rev++;
  return next;
}

/**
 * The lazy half of the state machine. Called on every read: if the clock has
 * run out on a phase that has no other exit, the phase moves on here.
 */
export function advance(room: Room, now: number): Room {
  if (room.phase === "drawing" && room.deadline !== null && now >= room.deadline) {
    // Nothing was ever uploaded: there is nothing for a model to look at, so
    // do not park the room in a guessing phase that cannot produce a guess.
    if (!room.image) return reveal(room, now);
    return finishDrawing(room, now);
  }
  if (room.phase === "guessing") {
    if (allDone(room) || (room.deadline !== null && now >= room.deadline)) return reveal(room, now);
  }
  return room;
}

export function transitionDue(room: Room, now: number): boolean {
  if (room.phase === "drawing" && room.deadline !== null && now >= room.deadline) return true;
  if (room.phase === "guessing" && (allDone(room) || (room.deadline !== null && now >= room.deadline))) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* What a browser is allowed to see                                     */
/* ------------------------------------------------------------------ */

export type PublicPlayer = { id: string; name: string; model: string; score: number; isDrawer: boolean };

export type PublicRoom = {
  code: string;
  rev: number;
  phase: Phase;
  round: number;
  totalRounds: number;
  drawerId: string;
  deadline: number | null;
  image: string | null;
  /** Null unless this viewer may know it: the artist, or everyone after the reveal. */
  word: string | null;
  you: string;
  players: PublicPlayer[];
  guesses: Guess[];
  history: RoundRecord[];
  errors: RoomError[];
};

/**
 * The secret word is the one thing a room must not leak. It goes only to the
 * artist, and to everyone once the round is over. Endpoints and tokens never
 * leave the server at all.
 */
export function publicRoom(room: Room, viewerId: string): PublicRoom {
  const revealed = room.phase === "reveal" || room.phase === "over";
  const maySeeWord = revealed || room.drawerId === viewerId;
  return {
    code: room.code,
    rev: room.rev,
    phase: room.phase,
    round: room.round,
    totalRounds: room.players.length,
    drawerId: room.drawerId,
    deadline: room.deadline,
    image: room.image,
    word: maySeeWord ? room.word : null,
    you: viewerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, model: p.model, score: p.score, isDrawer: p.id === room.drawerId })),
    guesses: room.guesses,
    history: room.history,
    errors: room.errors ?? [],
  };
}
