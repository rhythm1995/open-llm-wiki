/**
 * statusChipClass —— 词根分桶;先匹配的桶赢;大小写不敏感。
 */
import { describe, it, expect } from "vitest";
import { statusChipClass } from "./status-chip";

const GREEN = "bg-green/15 text-green";
const BLUE = "bg-blue/15 text-blue";
const RED = "bg-red/15 text-red";
const OVERLAY = "bg-overlay/15 text-overlay";
const YELLOW = "bg-yellow/15 text-yellow";
const FALLBACK = "bg-surface text-subtext";

describe("statusChipClass", () => {
  it("进行中词根进绿桶", () => {
    expect(statusChipClass("active")).toBe(GREEN);
    expect(statusChipClass("in-progress")).toBe(GREEN);
    expect(statusChipClass("Draft")).toBe(GREEN);
  });

  it("完成词根进蓝桶", () => {
    expect(statusChipClass("done")).toBe(BLUE);
    expect(statusChipClass("CLOSED")).toBe(BLUE);
    expect(statusChipClass("shipped")).toBe(BLUE);
  });

  it("冲突/失败词根进红桶", () => {
    expect(statusChipClass("blocked")).toBe(RED);
    expect(statusChipClass("failed")).toBe(RED);
  });

  it("废弃词根进 overlay 桶", () => {
    expect(statusChipClass("archived")).toBe(OVERLAY);
    expect(statusChipClass("deprecated")).toBe(OVERLAY);
  });

  it("等待/评审词根进黄桶", () => {
    expect(statusChipClass("pending")).toBe(YELLOW);
    expect(statusChipClass("in review")).toBe(YELLOW);
  });

  it("未识别回退中性色", () => {
    expect(statusChipClass("unknown")).toBe(FALLBACK);
    expect(statusChipClass("")).toBe(FALLBACK);
  });

  it("先匹配的桶赢:同时含 active 与 done 走绿", () => {
    expect(statusChipClass("active but done later")).toBe(GREEN);
  });
});
