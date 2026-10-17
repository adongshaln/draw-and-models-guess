import type { Shape } from "@/lib/creatures";

/**
 * Seat colours, taken from the open-pictionary racer table so the game looks
 * like the thing it was forked from: seven lab colours and their seven bodies,
 * plus the flower that repo defined and never used, for an eighth player.
 */
export type Seat = { color: string; shape: Shape; room: string };

export const SEATS: Seat[] = [
  { color: "#F2442E", shape: "circle", room: "#FF8A7A" },
  { color: "#6B4EFF", shape: "square", room: "#BBA8FF" },
  { color: "#00A870", shape: "triangle", room: "#6FE3B0" },
  { color: "#F2338C", shape: "pill", room: "#FF9BC8" },
  { color: "#1F6BFF", shape: "drop", room: "#86C3FF" },
  { color: "#00B2D6", shape: "star", room: "#8FE6F5" },
  { color: "#FF7A1A", shape: "hex", room: "#FFBE85" },
  { color: "#8B5CF6", shape: "flower", room: "#CDB6FF" },
];

export function seatFor(index: number): Seat {
  return SEATS[(index < 0 ? 0 : index) % SEATS.length];
}

export function seatOf(players: { id: string }[], id: string): Seat {
  return seatFor(players.findIndex((p) => p.id === id));
}

/** The room colour for a round: the same room keeps its colour, a new one moves on. */
const ROOMS = ["#ffd84a", "#ffb08a", "#a9e6a4", "#9fd3ff", "#d9c2ff", "#ffc7dc", "#b8ecdd"];

export function roomColor(code: string, round = 0): string {
  let h = round * 31;
  for (let i = 0; i < code.length; i++) h = (h * 33 + code.charCodeAt(i)) % 100003;
  return ROOMS[h % ROOMS.length];
}
