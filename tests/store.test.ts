import { describe, expect, it } from "vitest";
import { OVER_TTL_SECONDS, ttlFor } from "@/lib/store";
import { ROOM_TTL_SECONDS, type Room } from "@/lib/room";

function room(phase: Room["phase"]): Room {
  return {
    code: "ABCDE",
    rev: 1,
    createdAt: 0,
    phase,
    round: 1,
    drawerId: "p1",
    word: null,
    deadline: null,
    image: null,
    players: [],
    guesses: [],
    history: [],
  };
}

describe("房间寿命", () => {
  it("一局结束就只剩五分钟，之后 Redis 自己删掉整间房", () => {
    expect(ttlFor(room("over"))).toBe(OVER_TTL_SECONDS);
    expect(OVER_TTL_SECONDS).toBe(300);
  });

  it("其它阶段按六小时算", () => {
    for (const phase of ["lobby", "drawing", "guessing", "reveal"] as const) {
      expect(ttlFor(room(phase))).toBe(ROOM_TTL_SECONDS);
    }
  });
});
