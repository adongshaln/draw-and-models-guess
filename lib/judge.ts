import { findWord, type Word } from "@/lib/words";

/**
 * 裁判。全部是纯函数、确定性的：不问模型，所以一屋子自带 key 的玩家
 * 不会为判词再花一分钱，而且判词可以被单元测试固定住。
 *
 * 中文和英文都要能判：词是中文的，但模型很可能用英文作答，所以同义词表
 * 里中英混放，判词对两种文字一视同仁。
 */
export type Verdict = "correct" | "close" | "wrong";

const ARTICLES = new Set(["a", "an", "the", "some", "my", "your"]);

/** 包在答案外面的词，去掉之后不改变它指的是什么。 */
const FILLER = new Set([
  "drawing", "draw", "sketch", "doodle", "picture", "image", "cartoon", "icon",
  "outline", "shape", "symbol", "emoji", "little", "small", "big", "cute",
  "of", "a", "an", "the", "simple",
  // 中文的同类词，按子串整段去掉
  "这是", "一只", "一个", "一条", "一张", "一幅", "这个", "那个", "画的", "简笔画",
  "图案", "卡通", "图片", "涂鸦", "看起来像", "我猜是", "答案是",
]);

/** 这几个单字只做整段剥离，而且都够虚，不会伤到真词。 */
const CJK_PARTICLES = ["的", "了", "是"];

const CJK = /[\u3400-\u9fff]/;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // 保留字母（含汉字）和数字，其余一律当分隔符
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(w: string): string {
  // 只对纯英文词做单数化：中文没有这个概念
  if (!/^[a-z]+$/.test(w)) return w;
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
  let out = s;
  for (const w of FILLER) {
    if (CJK.test(w) || w.length === 1) out = out.split(w).join(" ");
  }
  for (const w of CJK_PARTICLES) out = out.split(w).join(" ");
  const kept = out.split(" ").filter((w) => w && !FILLER.has(w));
  return kept.length ? kept.join(" ") : s;
}

/** 编辑距离，最多算到 1：只关心是不是打错一个字母。 */
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
 * 把模型的原始回复洗成一个猜测：第一行、去掉思考块、去掉"这是一只"之类的
 * 前缀、去掉标点、最多四个词。
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
 * 判一个洗好的猜测。
 *
 * - correct：就是那个词、表里的同义词（中英皆可）、外面包了填充词、
 *   或者长英文词打错一个字母。
 * - close：一个包含另一个，给个"接近"的反馈（"热狗"对"狗"仍然不算中，
 *   但读起来比"错"好）。
 * - wrong：其它。
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
    // 错字容忍只给长英文词：house 和 horse 只差一个字母。
    if (/^[a-z]+$/.test(f) && f.length >= 8 && (within1(g, f) || within1(gs, f))) return "correct";
  }

  const plain = g.replace(/ /g, "");
  if (plain.length >= 2) {
    for (const form of forms) {
      const f = canon(form).replace(/ /g, "");
      // 中文按字包含就够了（"热狗"包含"狗"）；英文要三个字母起。
      const minLen = CJK.test(f) ? 1 : 3;
      if (f.length >= minLen && (plain.includes(f) || f.includes(plain))) return "close";
    }
  }
  return "wrong";
}
