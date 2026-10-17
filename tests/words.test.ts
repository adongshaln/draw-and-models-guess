import { describe, expect, it } from "vitest";
import { WORDS, findWord, pickWord } from "@/lib/words";

describe("词库", () => {
  it("166 个词，三个难度分别 50 / 86 / 30", () => {
    expect(WORDS).toHaveLength(166);
    expect(WORDS.filter((w) => w.level === 1)).toHaveLength(50);
    expect(WORDS.filter((w) => w.level === 2)).toHaveLength(86);
    expect(WORDS.filter((w) => w.level === 3)).toHaveLength(30);
  });

  it("没有重复的词", () => {
    expect(new Set(WORDS.map((w) => w.word)).size).toBe(WORDS.length);
  });

  it("每个词都是中文，且至少带一个同义词", () => {
    for (const w of WORDS) {
      expect(w.word, `${w.word} 应该是汉字`).toMatch(/[\u3400-\u9fff]/);
      expect(w.also.length, `${w.word} 没有同义词`).toBeGreaterThan(0);
    }
  });

  it("同义词不为空，也不等于词本身", () => {
    for (const w of WORDS) {
      for (const a of w.also) {
        expect(a.length).toBeGreaterThan(0);
        expect(a).not.toBe(w.word);
      }
    }
  });

  it("查得到，也能被排除", () => {
    expect(findWord("猫")?.level).toBe(1);
    expect(findWord("蜘蛛")?.also).toContain("spider");
    expect(findWord("不存在的词")).toBeUndefined();
    for (let i = 0; i < 50; i++) expect(pickWord(["猫", "狗"]).word).not.toMatch(/^(猫|狗)$/);
  });
});
