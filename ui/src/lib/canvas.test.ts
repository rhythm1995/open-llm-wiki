/**
 * canvas 纯逻辑单测(F-CANVAS)。
 *
 * 只测字符串 ↔ 快照的 round-trip 与边界判定;tldraw 运行时不在单测里加载
 * (canvas.ts 用 `import type` 擦除依赖)。CanvasView 的挂载/落盘行为靠
 * tsc + 构建兜底,不在此单测。
 */
import { describe, it, expect } from "vitest";
import {
  emptyCanvasContent,
  parseCanvasContent,
  serializeCanvasContent,
  isCanvasPath,
} from "./canvas";

const SNAP = { document: { schema: {}, store: {} }, session: {} };

describe("emptyCanvasContent", () => {
  it("返回空串", () => {
    expect(emptyCanvasContent()).toBe("");
  });
});

describe("parseCanvasContent", () => {
  it("空串 / 纯空白 → null", () => {
    expect(parseCanvasContent("")).toBeNull();
    expect(parseCanvasContent("   \n\t ")).toBeNull();
  });

  it("非 JSON → null", () => {
    expect(parseCanvasContent("not json")).toBeNull();
    expect(parseCanvasContent("{ broken")).toBeNull();
  });

  it("JSON 但非对象(数字/数组/字符串)→ null", () => {
    expect(parseCanvasContent("42")).toBeNull();
    expect(parseCanvasContent("[1,2,3]")).toBeNull();
    expect(parseCanvasContent('"hi"')).toBeNull();
    expect(parseCanvasContent("null")).toBeNull();
    expect(parseCanvasContent("true")).toBeNull();
  });

  it("对象但缺 document 字段 → null", () => {
    expect(parseCanvasContent('{"foo":1}')).toBeNull();
    expect(parseCanvasContent('{"document":null}')).toBeNull();
    expect(parseCanvasContent('{"document":"x"}')).toBeNull();
  });

  it("带 document 对象 → 原样返回(深结构不校验)", () => {
    const got = parseCanvasContent('{"document":{"store":{}},"session":{}}');
    expect(got).toEqual({ document: { store: {} }, session: {} });
  });

  it("普通 markdown 正文(看起来像对象但有 # 标题)→ null", () => {
    expect(parseCanvasContent("# 标题\n正文")).toBeNull();
  });
});

describe("serializeCanvasContent round-trip", () => {
  it("parse(serialize(x)) ≈ x(字段保留)", () => {
    const s = JSON.stringify(SNAP);
    const back = parseCanvasContent(s);
    expect(back).toEqual(SNAP);
  });

  it("serialize 输出美化 JSON(含换行与缩进)", () => {
    // @ts-expect-error 测试用:用最小合法快照形状
    const out = serializeCanvasContent({ document: { a: 1 }, session: {} });
    expect(out).toContain('\n  "document"');
    expect(out).toContain('"a": 1');
  });
});

describe("isCanvasPath", () => {
  it("大小写后缀都认", () => {
    expect(isCanvasPath("a.canvas")).toBe(true);
    expect(isCanvasPath("a/b/CANVAS.CANVAS")).toBe(true);
  });
  it("非 .canvas / 目录 / 空串 → false", () => {
    expect(isCanvasPath("a.md")).toBe(false);
    expect(isCanvasPath("canvas.md")).toBe(false);
    expect(isCanvasPath("dir/canvas")).toBe(false);
    expect(isCanvasPath("")).toBe(false);
  });
});
