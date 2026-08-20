import { describe, it, expect } from "vitest";
import { DOC_PAGES, pageBySlug, otherLocale, loadDocSource } from "./docs";

describe("docs catalog", () => {
  it("slug 唯一且含 start", () => {
    const slugs = DOC_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("start");
  });

  it("未知 slug 回落到 start", () => {
    expect(pageBySlug("nope").slug).toBe("start");
    expect(pageBySlug(undefined).slug).toBe("start");
  });

  it("otherLocale 对翻", () => {
    expect(otherLocale("en")).toBe("zh");
    expect(otherLocale("zh")).toBe("en");
  });

  it("每页中英源文都能载入且非空", () => {
    for (const page of DOC_PAGES) {
      const en = loadDocSource(page, "en");
      const zh = loadDocSource(page, "zh");
      expect(en.length).toBeGreaterThan(40);
      expect(zh.length).toBeGreaterThan(40);
    }
  });
});
