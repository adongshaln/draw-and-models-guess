/**
 * One call to one player's model, over the OpenAI-compatible chat wire. Every
 * provider worth using speaks it, which is the whole reason the game asks for a
 * base URL instead of shipping an SDK per vendor.
 *
 * The key is passed in by the player's own browser for this one request. It is
 * never written to the room, never logged, and never put in an error message.
 */
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 25_000;

export const SYSTEM_PROMPT = [
  "You are playing Pictionary. A person drew a picture and you must name what it is.",
  "The drawing may be crude, and it may be unfinished.",
  "Guess the one thing, animal, place, action or idea it shows.",
  "Reply with only your guess: one to three words, lowercase, no punctuation, no explanation.",
  "Never answer with a bare shape like circle, line or squiggle; name what it is becoming.",
  "Never repeat a guess you were told is wrong.",
].join(" ");

/** Accepts .../v1, .../v1/ or a full .../chat/completions URL. */
export function chatUrl(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

export type ChatResult = { text: string; latencyMs: number };

export async function askModel(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  image: string;
  wrong: string[];
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const note = opts.wrong.length
    ? `Wrong so far: ${opts.wrong.slice(-10).join(", ")}. What is it now?`
    : "What is it?";

  const body = {
    model: opts.model,
    max_tokens: 24,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: note },
          { type: "image_url", image_url: { url: opts.image } },
        ],
      },
    ],
  };

  const started = Date.now();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const res = await fetch(chatUrl(opts.endpoint), {
    method: "POST",
    signal,
    redirect: "manual", // a redirect here is a different host than the one we vetted
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      "User-Agent": "draw-and-models-guess/1.0",
    },
    body: JSON.stringify(body),
  });

  if (res.status >= 300 && res.status < 400) throw new Error(`The endpoint redirected (${res.status}).`);
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`The model endpoint answered ${res.status}. ${detail}`.trim());
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("The model endpoint answered with too much data.");

  const raw = await res.text();
  if (raw.length > MAX_BYTES) throw new Error("The model endpoint answered with too much data.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("The model endpoint did not answer with JSON.");
  }

  const content = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (typeof c === "string" ? c : "")).join(" ") : "";
  if (!text.trim()) throw new Error("The model answered with nothing.");
  return { text, latencyMs: Date.now() - started };
}
