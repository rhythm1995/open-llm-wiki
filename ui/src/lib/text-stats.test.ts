import { describe, it, expect } from "vitest";
import { countText } from "./text-stats";

describe("countText", () => {
  it("空串为零", () => {
    expect(countText("")).toEqual({ chars: 0, lines: 0, words: 0 });
  });

  it("纯空白也算零词", () => {
    expect(countText("   \n\t  ")).toEqual({ chars: 7, lines: 2, words: 0 });
  });

  it("英文按空白切词", () => {
    expect(countText("hello world").words).toBe(2);
  });

  it("连字符/下划线/标点都切词", () => {
    expect(countText("one-two_three, four").words).toBe(4);
  });

  it("数字段单独计词", () => {
    expect(countText("123 45 six").words).toBe(3);
  });

  it("中文按连续汉字串计词(不分词)", () => {
    // "世界" 连续算 1 词,"hello" 1 词 → 共 2 词。
    expect(countText("hello 世界").words).toBe(2);
  });

  it("字符数等于 length(含换行/空白)", () => {
    expect(countText("a\nb").chars).toBe(3);
  });

  it("行数:无换行计 1 行", () => {
    expect(countText("abc").lines).toBe(1);
  });

  it("行数:按 \\n 切,末尾无换行也计一行", () => {
    expect(countText("line1\nline2").lines).toBe(2);
    expect(countText("line1\nline2\n").lines).toBe(3);
  });

  it("综合:中英混排 + 多行", () => {
    const s = "标题 title\n第二行 line2";
    const stats = countText(s);
    expect(stats.chars).toBe(s.length);
    expect(stats.lines).toBe(2);
    expect(stats.words).toBe(4); // 标题 / title / 第二行 / line2
  });
});
