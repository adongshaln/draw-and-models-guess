import { describe, expect, it } from "vitest";
import {
  DRAW_SECONDS,
  GUESS_SECONDS,
  MAX_ATTEMPTS,
  advance,
  allDone,
  finishDrawing,
  guessesBy,
  nextRound,
  pointsFor,
  publicRoom,
  recordGuess,
  reveal,
  startGame,
  transitionDue,
  type Room,
} from "@/lib/room";

function makeRoom(): Room {
  return {
    code: "ABCDE",
    rev: 1,
    createdAt: 0,
    phase: "lobby",
    round: 1,
    drawerId: "p1",
    word: null,
    deadline: null,
    image: null,
    players: [
      { id: "p1", token: "t1", name: "Ada", endpoint: "https://a.example/v1", model: "m-one", score: 0, joinedAt: 0 },
      { id: "p2", token: "t2", name: "Bob", endpoint: "https://b.example/v1", model: "m-two", score: 0, joinedAt: 1 },
    ],
    guesses: [],
    history: [],
  };
}

describe("pointsFor", () => {
  it("pays more for an earlier look", () => {
    expect(pointsFor(1)).toBe(3);
    expect(pointsFor(2)).toBe(2);
    expect(pointsFor(3)).toBe(1);
  });
});

describe("startGame", () => {
  it("hands the pencil to the host and keeps the word to the artist", () => {
    const started = startGame(makeRoom(), 1000, "cat");
    expect(started.phase).toBe("drawing");
    expect(started.round).toBe(1);
    expect(started.drawerId).toBe("p1");
    expect(started.word).toBe("cat");
    expect(started.deadline).toBe(1000 + DRAW_SECONDS * 1000);
    expect(publicRoom(started, "p2").word).toBeNull();
    expect(publicRoom(started, "p1").word).toBe("cat");
  });
});

describe("recordGuess", () => {
  it("scores the solver and the artist", () => {
    const started = startGame(makeRoom(), 1000, "cat");
    const guessed = recordGuess(started, "p2", "cat", "correct", 2000, "g1");
    expect(guessed.players.find((p) => p.id === "p2")?.score).toBe(3);
    expect(guessed.players.find((p) => p.id === "p1")?.score).toBe(1);
  });

  it("does not pay the artist for their own model", () => {
    const started = startGame(makeRoom(), 1000, "cat");
    const guessed = recordGuess(started, "p1", "cat", "correct", 2000, "g1");
    expect(guessed.players.find((p) => p.id === "p1")?.score).toBe(3);
    expect(guessed.players.find((p) => p.id === "p2")?.score).toBe(0);
  });

  it("pays less on a later look", () => {
    let room = startGame(makeRoom(), 1000, "cat");
    room = recordGuess(room, "p2", "dog", "wrong", 2000, "g1");
    room = recordGuess(room, "p2", "kitten", "correct", 3000, "g2");
    expect(room.players.find((p) => p.id === "p2")?.score).toBe(2);
  });

  it("ignores a fourth look and anything after a solve", () => {
    let room = startGame(makeRoom(), 1000, "cat");
    for (let i = 0; i < 3; i++) room = recordGuess(room, "p2", "dog", "wrong", 2000 + i, `g${i}`);
    expect(guessesBy(room, "p2")).toHaveLength(MAX_ATTEMPTS);
    const after = recordGuess(room, "p2", "cat", "correct", 5000, "g4");
    expect(guessesBy(after, "p2")).toHaveLength(MAX_ATTEMPTS);
    expect(after.players.find((p) => p.id === "p2")?.score).toBe(0);

    let solved = startGame(makeRoom(), 1000, "cat");
    solved = recordGuess(solved, "p2", "cat", "correct", 2000, "g1");
    const again = recordGuess(solved, "p2", "cat", "correct", 3000, "g2");
    expect(guessesBy(again, "p2")).toHaveLength(1);
  });

  it("ignores a guess from nobody", () => {
    const room = startGame(makeRoom(), 1000, "cat");
    expect(recordGuess(room, "ghost", "cat", "correct", 2000, "g1")).toBe(room);
  });
});

describe("phase clock", () => {
  it("ends the drawing phase when the clock runs out", () => {
    const started = startGame(makeRoom(), 1000, "cat");
    const late = started.deadline! + 1;
    expect(transitionDue(started, late)).toBe(true);
    const moved = advance(started, late);
    expect(moved.phase).toBe("guessing");
    expect(moved.deadline).toBe(late + GUESS_SECONDS * 1000);
  });

  it("leaves a live round alone", () => {
    const started = startGame(makeRoom(), 1000, "cat");
    expect(transitionDue(started, 2000)).toBe(false);
    expect(advance(started, 2000)).toBe(started);
  });

  it("reveals once every model has used its looks", () => {
    let room = finishDrawing(startGame(makeRoom(), 1000, "cat"), 2000, "data:image/png;base64,AAA");
    expect(allDone(room)).toBe(false);
    room = recordGuess(room, "p1", "cat", "correct", 3000, "g1");
    room = recordGuess(room, "p2", "dog", "wrong", 3000, "g2");
    room = recordGuess(room, "p2", "dog", "wrong", 3000, "g3");
    room = recordGuess(room, "p2", "dog", "wrong", 3000, "g4");
    expect(allDone(room)).toBe(true);
    const revealed = advance(room, 4000);
    expect(revealed.phase).toBe("reveal");
    expect(revealed.history).toHaveLength(1);
    expect(revealed.history[0].solvers).toEqual([{ playerId: "p1", attempt: 1, points: 3 }]);
  });
});

describe("reveal", () => {
  it("shows the word to everyone", () => {
    const room = reveal(startGame(makeRoom(), 1000, "cat"), 2000);
    expect(publicRoom(room, "p2").word).toBe("cat");
  });
});

describe("nextRound", () => {
  it("passes the pencil to the next player", () => {
    const room = reveal(startGame(makeRoom(), 1000, "cat"), 2000);
    const next = nextRound(room, 3000, "dog");
    expect(next.phase).toBe("drawing");
    expect(next.round).toBe(2);
    expect(next.drawerId).toBe("p2");
    expect(next.word).toBe("dog");
    expect(next.guesses).toHaveLength(0);
    expect(next.image).toBeNull();
  });

  it("ends the game once everyone has drawn", () => {
    let room = startGame(makeRoom(), 1000, "cat");
    room = reveal(room, 2000);
    room = nextRound(room, 3000, "dog");
    room = reveal(room, 4000);
    const done = nextRound(room, 5000, "owl");
    expect(done.phase).toBe("over");
    expect(done.history).toHaveLength(2);
  });
});

describe("publicRoom", () => {
  it("never leaks a token or an endpoint", () => {
    const room = startGame(makeRoom(), 1000, "cat");
    const view = publicRoom(room, "p1");
    const json = JSON.stringify(view);
    expect(json).not.toContain("t1");
    expect(json).not.toContain("a.example");
  });

  it("marks the artist", () => {
    const room = startGame(makeRoom(), 1000, "cat");
    const view = publicRoom(room, "p2");
    expect(view.players.find((p) => p.id === "p1")?.isDrawer).toBe(true);
    expect(view.players.find((p) => p.id === "p2")?.isDrawer).toBe(false);
  });
});
