import { describe, expect, it } from "vitest";
import { PRESETS, presetByKey, presetMatches } from "@/lib/presets";

describe("模型预设", () => {
  it("每个预设都是 https，带模型 ID，输出预算 10k", () => {
    for (const p of PRESETS) {
      expect(p.endpoint.startsWith("https://"), `${p.key} 的地址`).toBe(true);
      expect(p.model.length, `${p.key} 的模型 ID`).toBeGreaterThan(0);
      expect(p.params.max_tokens, `${p.key} 的预算`).toBe(10000);
    }
  });

  it("每个预设都带一个关思考的开关", () => {
    for (const p of PRESETS) {
      const json = JSON.stringify(p.params);
      expect(json, `${p.key} 没有关思考的字段`).toMatch(/reasoning|thinking|enable_thinking/);
    }
  });

  it("key 和模型 ID 都不重复", () => {
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.model)).size).toBe(PRESETS.length);
  });

  it("DeepSeek 官方用 thinking.type 关掉（官方默认是开的）", () => {
    const p = presetByKey("deepseek-official");
    expect(p?.endpoint).toBe("https://api.deepseek.com");
    expect(p?.model).toBe("deepseek-flash");
    expect(p?.params.thinking).toEqual({ type: "disabled" });
  });

  it("presetMatches 只在地址和模型都还一致时为真", () => {
    const p = presetByKey("gemini-official")!;
    expect(presetMatches(p, p.endpoint, p.model)).toBe(true);
    expect(presetMatches(p, p.endpoint, "gemini-9-flash")).toBe(false);
    expect(presetMatches(p, "https://example.com/v1", p.model)).toBe(false);
  });
});
