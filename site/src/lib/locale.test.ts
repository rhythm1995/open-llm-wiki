import { describe, it, expect } from "vitest";
import { parseLocale, copy, principles, faqs } from "./locale";

describe("parseLocale", () => {
  it("仅 zh 为中文,其余回落 en", () => {
    expect(parseLocale("zh")).toBe("zh");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale(null)).toBe("en");
    expect(parseLocale("fr")).toBe("en");
  });
});

describe("copy / principles / faqs", () => {
  it("中英五条原则对齐编号", () => {
    expect(principles.en).toHaveLength(5);
    expect(principles.zh).toHaveLength(5);
    expect(principles.en.map((p) => p.n)).toEqual(principles.zh.map((p) => p.n));
  });

  it("FAQ 条数中英一致,文案非空", () => {
    expect(faqs.en.length).toBe(faqs.zh.length);
    expect(faqs.en.length).toBeGreaterThan(0);
    for (const item of [...faqs.en, ...faqs.zh]) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
    }
  });

  it("主标存在", () => {
    expect(copy.en.heroTitle).toMatch(/Files are the truth/);
    expect(copy.zh.heroTitle).toMatch(/文件即真相/);
  });
});
