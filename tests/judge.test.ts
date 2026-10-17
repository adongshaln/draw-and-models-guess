import { describe, expect, it } from "vitest";
import { cleanGuess, judgeGuess, normalize, within1 } from "@/lib/judge";

describe("normalize", () => {
  it("去掉标点并压缩空格", () => {
    expect(normalize("  热狗!!  ")).toBe("热狗");
    expect(normalize("一只 猫。")).toBe("一只 猫");
  });

  it("保留汉字", () => {
    expect(normalize("蜘蛛")).toBe("蜘蛛");
    expect(normalize("光合作用！")).toBe("光合作用");
  });

  it("拉丁字母去音标", () => {
    expect(normalize("Café")).toBe("cafe");
  });
});

describe("within1", () => {
  it("接受一处编辑", () => {
    expect(within1("girafe", "giraffe")).toBe(true);
    expect(within1("elephent", "elephant")).toBe(true);
  });

  it("拒绝两处编辑", () => {
    expect(within1("girafe", "giraffee")).toBe(false);
    expect(within1("cat", "dog")).toBe(false);
  });
});

describe("cleanGuess", () => {
  it("只取第一行", () => {
    expect(cleanGuess("马\n它有四条腿")).toBe("马");
  });

  it("剥掉思考块", () => {
    expect(cleanGuess("<think>想很久</think>猫头鹰")).toBe("猫头鹰");
  });

  it("剥掉英文前缀", () => {
    expect(cleanGuess("It's a cat")).toBe("cat");
    expect(cleanGuess("Answer: dog")).toBe("dog");
  });

  it("截断过长的回答", () => {
    expect(cleanGuess("x".repeat(80)).length).toBe(40);
  });
});

describe("judgeGuess", () => {
  it("同一个词算对", () => {
    expect(judgeGuess("猫", "猫")).toBe("correct");
  });

  it("表里的中文同义词算对", () => {
    expect(judgeGuess("小猫", "猫")).toBe("correct");
    expect(judgeGuess("自行车", "自行车")).toBe("correct");
  });

  it("英文答案也算对", () => {
    expect(judgeGuess("cat", "猫")).toBe("correct");
    expect(judgeGuess("spider", "蜘蛛")).toBe("correct");
    expect(judgeGuess("ice cream", "冰淇淋")).toBe("correct");
  });

  it("外面包了填充词也算对", () => {
    expect(judgeGuess("一只猫", "猫")).toBe("correct");
    expect(judgeGuess("这是一只蜘蛛", "蜘蛛")).toBe("correct");
    expect(judgeGuess("drawing of a cat", "猫")).toBe("correct");
  });

  it("相关但不同的答案判接近", () => {
    expect(judgeGuess("热狗", "狗")).toBe("close");
    expect(judgeGuess("蜘蛛侠", "蜘蛛")).toBe("close");
    expect(judgeGuess("sunflower", "flower")).toBe("close");
  });

  it("不相干的答案判错", () => {
    expect(judgeGuess("动物", "猫")).toBe("wrong");
    expect(judgeGuess("bicycle", "猫")).toBe("wrong");
    expect(judgeGuess("", "猫")).toBe("wrong");
  });

  it("长英文词容忍一个错字，短词不容忍", () => {
    expect(judgeGuess("elephent", "elephant")).toBe("correct");
    expect(judgeGuess("hose", "house")).not.toBe("correct");
  });
});
