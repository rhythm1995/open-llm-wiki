import { describe, it, expect } from "vitest";
import { formatDateStr, formatMs } from "./date-format";

// `now` 固定在 2026 年(6 月 15 日,本地时区),用于判定"同年显 M/D"。
const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();
const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();

describe("formatMs", () => {
  it("同年 → 紧凑 M/D(无补零)", () => {
    expect(formatMs(ms(2026, 7, 29), NOW)).toBe("7/29");
    expect(formatMs(ms(2026, 1, 5), NOW)).toBe("1/5");
  });
  it("跨年 → YYYY/M/D", () => {
    expect(formatMs(ms(2024, 1, 15), NOW)).toBe("2024/1/15");
  });
  it("0 / 负 / 无效 → 占位符", () => {
    expect(formatMs(0, NOW)).toBe("—");
    expect(formatMs(-1, NOW)).toBe("—");
    expect(formatMs(Number.NaN, NOW)).toBe("—");
  });
});

describe("formatDateStr", () => {
  it("YYYY-MM-DD 同年 → M/D", () => {
    expect(formatDateStr("2026-07-25", NOW)).toBe("7/25");
  });
  it("YYYY-MM-DD 跨年 → YYYY/M/D", () => {
    expect(formatDateStr("2023-03-01", NOW)).toBe("2023/3/1");
  });
  it("单位数月/日也接受(不补零)", () => {
    expect(formatDateStr("2026-3-7", NOW)).toBe("3/7");
  });
  it("null → 占位符", () => {
    expect(formatDateStr(null, NOW)).toBe("—");
  });
  it("不可解析串 → 原样返回(不丢信息)", () => {
    expect(formatDateStr("not-a-date", NOW)).toBe("not-a-date");
    expect(formatDateStr("上周三", NOW)).toBe("上周三");
  });
});
