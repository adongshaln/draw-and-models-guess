/**
 * One call to one player's model, over the OpenAI-compatible chat wire. Every
 * provider worth using speaks it, which is the whole reason the game asks for a
 * base URL instead of shipping an SDK per vendor.
 *
 * The key is passed in by the player's own browser for this one request. It is
 * never written to the room, never logged, and never put in an error message.
 */
/**
 * 自定义接口没有"关掉思考"的开关，预算给紧了一定出事：模型先把 token 花在
 * 推理上，交回来的是空字符串，或者半截词（"电子钟"只剩"电子"）。
 * 10k 是上限不是消耗——思考关掉的模型答完就停，关不掉的也够它想完再答。
 */
const DEFAULT_MAX_TOKENS = 10000;
/** 有的厂商会嫌 10k 太大直接 400，退到这一档再试一次。 */
const FALLBACK_MAX_TOKENS = 4096;
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 25_000;

export const SYSTEM_PROMPT = [
  "你在玩你画我猜。有人正在画一幅画，你要说出画的是什么。",
  "画可能很潦草，也可能还没画完。",
  "猜那一个东西、动物、地点、动作或概念。",
  "只回复你的答案：一到四个汉字，或一到三个英文单词；不要标点，不要解释。",
  "中文和英文都可以，用你觉得更顺的那个。",
  "不要用「圆形」「线条」「涂鸦」这类形状词，说出它正在变成什么。",
  "不要重复已经被告知猜错过的答案。",
].join("");

/** Accepts .../v1, .../v1/ or a full .../chat/completions URL. */
export function chatUrl(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

export type ChatResult = { text: string; latencyMs: number };

/**
 * A preset's request fields, and nothing more. Small, flat, JSON-safe: this is
 * the difference between a thinking switch and a payload.
 */
export function cleanParams(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 12) return undefined;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return undefined;
  }
  if (json.length > 600) return undefined;
  return value as Record<string, unknown>;
}

export async function askModel(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  image: string;
  wrong: string[];
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const note = opts.wrong.length
    ? `已经猜错的有：${opts.wrong.slice(-10).join("、")}。现在是什么？`
    : "这是什么？";

  // The preset's fields come first so they can raise max_tokens or switch
  // reasoning off, but they can never replace the model or the messages.
  const body = {
    max_tokens: DEFAULT_MAX_TOKENS,
    temperature: 0.3,
    ...(opts.params ?? {}),
    model: opts.model,
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
  const url = chatUrl(opts.endpoint);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
    "User-Agent": "sketch-test/1.0",
  };

  const first = Number((body as { max_tokens?: unknown }).max_tokens) || DEFAULT_MAX_TOKENS;
  const budgets = first > FALLBACK_MAX_TOKENS ? [first, FALLBACK_MAX_TOKENS] : [first];

  let res: Response | null = null;
  let failure = "";
  for (const budget of budgets) {
    res = await fetch(url, {
      method: "POST",
      signal,
      redirect: "manual", // a redirect here is a different host than the one we vetted
      headers,
      body: JSON.stringify({ ...body, max_tokens: budget }),
    });
    if (res.ok) break;
    if (res.status >= 300 && res.status < 400) throw new Error(`接口返回了重定向（${res.status}）。`);
    failure = (await res.text().catch(() => "")).slice(0, 200);
    // 只对"预算太大"这一类 400 退档重试，别的错误照实抛。
    const tooBig = res.status === 400 && /max_tokens|maximum|too large|too many/i.test(failure);
    if (!tooBig) break;
  }
  if (!res || !res.ok) throw new Error(`模型接口返回 ${res?.status ?? 0}。${failure}`.trim());

  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("模型返回的数据太大。");

  const raw = await res.text();
  if (raw.length > MAX_BYTES) throw new Error("模型返回的数据太大。");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("模型返回的不是 JSON。");
  }

  const choice = (json as { choices?: { message?: { content?: unknown }; finish_reason?: string }[] })?.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (typeof c === "string" ? c : "")).join(" ") : "";
  // finish_reason 是 length 就说明它没说完：要么空，要么是"电子钟"只剩"电子"。
  const cut = choice?.finish_reason === "length";
  if (!text.trim()) {
    throw new Error(
      cut
        ? "模型的 token 预算被思考吃光了，回答是空的。给它调大 max_tokens，或者换一个能关掉思考的模型。"
        : "模型没有给出答案。",
    );
  }
  if (cut) throw new Error("模型回答被截断了（token 预算不够），只拿到半截词。给它调大 max_tokens。");
  return { text, latencyMs: Date.now() - started };
}
