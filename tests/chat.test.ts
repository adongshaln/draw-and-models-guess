import { describe, expect, it } from "vitest";
import { chatUrl } from "@/lib/chat";

describe("chatUrl", () => {
  it("appends the path to a base URL", () => {
    expect(chatUrl("https://api.together.xyz/v1")).toBe("https://api.together.xyz/v1/chat/completions");
    expect(chatUrl("https://api.together.xyz/v1/")).toBe("https://api.together.xyz/v1/chat/completions");
    expect(chatUrl("https://api.together.xyz/v1///")).toBe("https://api.together.xyz/v1/chat/completions");
  });

  it("leaves a full URL alone", () => {
    expect(chatUrl("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("trims whitespace", () => {
    expect(chatUrl("  https://a.example/v1  ")).toBe("https://a.example/v1/chat/completions");
  });
});
