import { describe, expect, it } from "vitest";
import {
  clampFindIndex,
  findInDocument,
  nextFindIndex,
  offsetToLine,
} from "./find-in-doc";

describe("findInDocument", () => {
  it("空 query → 无匹配", () => {
    expect(findInDocument("hello", "").matches).toEqual([]);
  });

  it("大小写不敏感找全部", () => {
    const r = findInDocument("Foo foo FOO bar", "foo");
    expect(r.matches).toHaveLength(3);
    expect(r.matches[0]).toEqual({ from: 0, to: 3 });
    expect(r.matches[1]).toEqual({ from: 4, to: 7 });
  });

  it("字面量转义特殊字符", () => {
    const r = findInDocument("a+b a+b", "a+b");
    expect(r.matches).toHaveLength(2);
  });

  it("无匹配", () => {
    expect(findInDocument("abc", "zzz").matches).toEqual([]);
  });
});

describe("nextFindIndex / clamp", () => {
  it("循环前进后退", () => {
    expect(nextFindIndex(0, 3, 1)).toBe(1);
    expect(nextFindIndex(2, 3, 1)).toBe(0);
    expect(nextFindIndex(0, 3, -1)).toBe(2);
  });
  it("空匹配 clamp 为 0", () => {
    expect(clampFindIndex(5, 0)).toBe(0);
  });
});

describe("offsetToLine", () => {
  it("首行", () => {
    expect(offsetToLine("ab\ncd", 1)).toBe(1);
  });
  it("第二行", () => {
    expect(offsetToLine("ab\ncd", 3)).toBe(2);
  });
});
