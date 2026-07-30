import { describe, expect, it } from "vitest";
import {
  insertWikilink,
  setLineHeading,
  toggleBlockQuote,
  toggleBold,
  toggleBulletList,
  toggleItalic,
  wrapSelection,
} from "./md-format";

describe("wrapSelection / bold", () => {
  it("包裹选区", () => {
    const r = toggleBold("hello world", { from: 6, to: 11 });
    expect(r.text).toBe("hello **world**");
    expect(r.selection).toEqual({ from: 8, to: 13 });
  });
  it("再点去掉", () => {
    const r = toggleBold("hello **world**", { from: 6, to: 15 });
    expect(r.text).toBe("hello world");
  });
});

describe("toggleItalic / code", () => {
  it("斜体", () => {
    expect(toggleItalic("ab", { from: 0, to: 2 }).text).toBe("*ab*");
  });
});

describe("setLineHeading", () => {
  it("设 H2", () => {
    const r = setLineHeading("hello", { from: 0, to: 0 }, 2);
    expect(r.text).toBe("## hello");
  });
  it("去掉 heading", () => {
    const r = setLineHeading("## hello", { from: 3, to: 3 }, 0);
    expect(r.text).toBe("hello");
  });
});

describe("list / quote", () => {
  it("列表 toggle", () => {
    expect(toggleBulletList("item", { from: 0, to: 0 }).text).toBe("- item");
    expect(toggleBulletList("- item", { from: 2, to: 2 }).text).toBe("item");
  });
  it("引用", () => {
    expect(toggleBlockQuote("x", { from: 0, to: 0 }).text).toBe("> x");
  });
});

describe("insertWikilink", () => {
  it("空选插入", () => {
    const r = insertWikilink("ab", { from: 1, to: 1 });
    expect(r.text).toBe("a[[]]b");
    expect(r.selection.from).toBe(3);
  });
  it("有选区包裹", () => {
    expect(insertWikilink("ab", { from: 0, to: 2 }).text).toBe("[[ab]]");
  });
});

describe("wrapSelection edge", () => {
  it("from>to 交换", () => {
    const r = wrapSelection("abcd", { from: 3, to: 1 }, "[", "]");
    expect(r.text).toBe("a[bc]d");
  });
});
