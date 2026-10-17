import { findWord, type Word } from "@/lib/words";

/**
 * The referee. Everything here is pure and deterministic: no model is asked to
 * rule, so a room of players who all brought their own key never spends a token
 * on judging. That also means the ruling can be unit-tested, and that two
 * players on different machines always agree on the same answer.
 */
export type Verdict = "correct" | "close" | "wrong";

const ARTICLES = new Set(["a", "an", "the", "some", "my", "your"]);

/** Words that dress a guess up without changing what it names. */
const FILLER = new Set([
  "drawing", "draw", "sketch", "doodle", "picture", "image", "cartoon", "icon",
  "outline", "shape", "symbol", "emoji", "little", "small", "big", "cute",
  "of", "a", "an", "the", "simple",
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

function canon(s: string): string {
  return normalize(s)
    .split(" ")
    .filter((w) => w && !ARTICLES.has(w))
    .map(singular)
    .join(" ");
}

function stripFiller(s: string): string {
  const kept = s.split(" ").filter((w) => w && !FILLER.has(w));
  return kept.length ? kept.join(" ") : s;
}

/** Levenshtein, capped at 1: we only care whether it is a typo or not. */
export function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Turn a raw model reply into a guess: first line, no "it's a", no reasoning
 * block, no punctuation, at most four words.
 */
export function cleanGuess(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, " ");
  s = s.replace(/<[^>]{1,80}>/g, " ");
  s = s.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  s = s.replace(/^(guess|answer|final answer)\s*[:\-]\s*/i, "");
  s = s.replace(/^(it'?s|it is|this is|that'?s|i think it'?s|looks like|i see)\s+/i, "");
  s = normalize(s)
    .split(" ")
    .filter((w) => w && !ARTICLES.has(w))
    .slice(0, 4)
    .join(" ");
  return s.slice(0, 40);
}

/**
 * Judge a cleaned guess against the secret word.
 *
 * - correct: the word, a listed synonym, the same thing with filler around it,
 *   or a one-letter typo on a long word.
 * - close: one contains the other, so the referee can say "warm" instead of
 *   "no" ("hot dog" for "dog" is still not a win, but it reads better).
 * - wrong: anything else.
 */
export function judgeGuess(guess: string, secret: string): Verdict {
  const g = canon(guess);
  if (!g) return "wrong";
  const gs = stripFiller(g);
  const word: Word | undefined = findWord(secret);
  const forms = [secret, ...(word?.also ?? [])];

  for (const form of forms) {
    const f = canon(form);
    if (!f) continue;
    if (g === f || gs === f) return "correct";
    if (g.replace(/ /g, "") === f.replace(/ /g, "")) return "correct";
    if (gs.replace(/ /g, "") === f.replace(/ /g, "")) return "correct";
    // Typo tolerance only on long words: "house" and "horse" are one edit apart.
    if (f.length >= 8 && (within1(g, f) || within1(gs, f))) return "correct";
  }

  const plain = g.replace(/ /g, "");
  if (plain.length >= 3) {
    for (const form of forms) {
      const f = canon(form).replace(/ /g, "");
      if (f.length >= 3 && (plain.includes(f) || f.includes(plain))) return "close";
    }
  }
  return "wrong";
}
