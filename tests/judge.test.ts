import { describe, expect, it } from "vitest";
import { cleanGuess, judgeGuess, normalize, within1 } from "@/lib/judge";

describe("normalize", () => {
  it("lowercases, strips punctuation and collapses space", () => {
    expect(normalize("  Hot-Dog!!  ")).toBe("hot dog");
  });

  it("drops accents", () => {
    expect(normalize("Café")).toBe("cafe");
  });
});

describe("within1", () => {
  it("accepts a single edit", () => {
    expect(within1("girafe", "giraffe")).toBe(true);
    expect(within1("elefant", "elephant")).toBe(true);
  });

  it("refuses two edits", () => {
    expect(within1("girafe", "giraffee")).toBe(false);
    expect(within1("cat", "dog")).toBe(false);
  });
});

describe("cleanGuess", () => {
  it("keeps the first line only", () => {
    expect(cleanGuess("horse\nit has legs")).toBe("horse");
  });

  it("strips a reasoning block", () => {
    expect(cleanGuess("<think>long reasoning</think>owl")).toBe("owl");
  });

  it("strips the usual prefixes", () => {
    expect(cleanGuess("It's a cat")).toBe("cat");
    expect(cleanGuess("Answer: dog")).toBe("dog");
    expect(cleanGuess("looks like a snowman")).toBe("snowman");
  });

  it("caps at four words and forty characters", () => {
    expect(cleanGuess("one two three four five")).toBe("one two three four");
    expect(cleanGuess("x".repeat(80)).length).toBe(40);
  });
});

describe("judgeGuess", () => {
  it("accepts the word itself", () => {
    expect(judgeGuess("cat", "cat")).toBe("correct");
  });

  it("accepts a listed synonym", () => {
    expect(judgeGuess("kitten", "cat")).toBe("correct");
    expect(judgeGuess("bunny", "rabbit")).toBe("correct");
  });

  it("accepts plurals and articles", () => {
    expect(judgeGuess("cats", "cat")).toBe("correct");
    expect(judgeGuess("a cat", "cat")).toBe("correct");
    expect(judgeGuess("the cat", "cat")).toBe("correct");
  });

  it("accepts filler around the answer", () => {
    expect(judgeGuess("drawing of a cat", "cat")).toBe("correct");
    expect(judgeGuess("simple sketch of cat", "cat")).toBe("correct");
  });

  it("accepts a typo only on a long word", () => {
    expect(judgeGuess("girafe", "giraffe")).toBe("correct");
    expect(judgeGuess("hose", "house")).not.toBe("correct");
  });

  it("calls a related answer close rather than correct", () => {
    expect(judgeGuess("hot dog", "dog")).toBe("close");
    expect(judgeGuess("snowman", "snowflake")).toBe("close");
  });

  it("rejects an unrelated answer", () => {
    expect(judgeGuess("bicycle", "cat")).toBe("wrong");
    expect(judgeGuess("", "cat")).toBe("wrong");
  });

  it("does not accept a broad category", () => {
    expect(judgeGuess("animal", "cat")).toBe("wrong");
  });
});
