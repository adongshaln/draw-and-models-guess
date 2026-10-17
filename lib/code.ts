import { randomBytes, randomUUID } from "node:crypto";

/** No I, O, 0 or 1: a code gets read out loud across a room. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCode(length = 5): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newId(): string {
  return randomUUID();
}
