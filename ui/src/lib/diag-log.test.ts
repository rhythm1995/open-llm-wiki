/**
 * formatLogArg —— console 参数压成 LogBus 一行。
 */
import { describe, it, expect } from "vitest";
import { formatLogArg } from "./diag-log";

describe("formatLogArg", () => {
  it("Error 带 name、message 与 stack", () => {
    const err = new TypeError("boom");
    const out = formatLogArg(err);
    expect(out.startsWith("TypeError: boom")).toBe(true);
    expect(out).toContain("\n");
  });

  it("字符串原样返回", () => {
    expect(formatLogArg("hello")).toBe("hello");
  });

  it("可序列化对象走 JSON", () => {
    expect(formatLogArg({ a: 1 })).toBe('{"a":1}');
  });

  it("循环引用回退 String", () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(formatLogArg(a)).toBe("[object Object]");
  });
});
