import { describe, it, expect } from "vitest";
import { labelType, labelStatus } from "./wiki-labels";
import type { TFunc } from "./i18n";

const zh: Record<string, string> = {
  "wiki.type.Source": "来源",
  "wiki.type.Summary": "摘要",
  "wiki.type.Entity": "实体",
  "wiki.type.Concept": "主张",
  "wiki.type.Note": "笔记",
  "wiki.status.Active": "生效",
  "wiki.status.Contested": "争议中",
  "wiki.status.Digested": "已消化",
  "wiki.status.Unprocessed": "未消化",
};

const t = ((key: string) => zh[key] ?? key) as TFunc;

describe("labelType", () => {
  it("规范类型译中文", () => {
    expect(labelType("Source", t)).toBe("来源");
    expect(labelType("concept", t)).toBe("主张");
    expect(labelType("  Entity  ", t)).toBe("实体");
  });

  it("未知 type 原样", () => {
    expect(labelType("Book", t)).toBe("Book");
  });

  it("空 → 空", () => {
    expect(labelType(null, t)).toBe("");
    expect(labelType("  ", t)).toBe("");
  });
});

describe("labelStatus", () => {
  it("规范 status 译中文", () => {
    expect(labelStatus("Active", t)).toBe("生效");
    expect(labelStatus("contested", t)).toBe("争议中");
    expect(labelStatus("Unprocessed", t)).toBe("未消化");
  });

  it("未知 status 原样", () => {
    expect(labelStatus("shipping", t)).toBe("shipping");
  });
});
