/**
 * isIMEComposing —— IME 组合期判定单测。
 * 覆盖:nativeEvent.isComposing 真/假、keyCode 229 遗留标记、两者皆无。
 */
import { describe, it, expect } from "vitest";
import { isIMEComposing } from "./ime";

describe("isIMEComposing", () => {
  it("nativeEvent.isComposing=true → 组合期", () => {
    expect(isIMEComposing({ nativeEvent: { isComposing: true } })).toBe(true);
  });

  it("keyCode 229(组合期遗留标记)→ 组合期", () => {
    expect(isIMEComposing({ nativeEvent: { isComposing: false }, keyCode: 229 })).toBe(
      true,
    );
    expect(isIMEComposing({ keyCode: 229 })).toBe(true);
  });

  it("普通按键 → 非组合期", () => {
    expect(isIMEComposing({ nativeEvent: { isComposing: false }, keyCode: 13 })).toBe(
      false,
    );
    expect(isIMEComposing({ nativeEvent: {}, keyCode: 65 })).toBe(false);
    expect(isIMEComposing({})).toBe(false);
  });
});
