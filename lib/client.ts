/** Everything this browser remembers. Nothing here is ever sent anywhere but this origin. */

export type Me = {
  name: string;
  /** Base URL of an OpenAI-compatible API, e.g. https://api.together.xyz/v1 */
  endpoint: string;
  /** The model id as the provider spells it. */
  model: string;
  /** Which preset filled the two fields above, if any. */
  presetKey?: string;
  /** Kept in this browser only, and passed to the server one call at a time. */
  apiKey: string;
};

export type Seat = { playerId: string; token: string };

const ME_KEY = "damg:me:v1";
const seatKey = (code: string) => `damg:seat:${code.toUpperCase()}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, or a full quota: the game still works for this tab */
  }
}

export function loadMe(): Me | null {
  const me = read<Me>(ME_KEY);
  if (!me || !me.name || !me.endpoint || !me.model) return null;
  return { ...me, apiKey: me.apiKey ?? "" };
}

export function saveMe(me: Me) {
  write(ME_KEY, me);
}

export function loadSeat(code: string): Seat | null {
  return read<Seat>(seatKey(code));
}

export function saveSeat(code: string, seat: Seat) {
  write(seatKey(code), seat);
}
