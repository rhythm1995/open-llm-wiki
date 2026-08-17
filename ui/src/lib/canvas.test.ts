/**
 * canvas 纯逻辑单测(F-CANVAS / Excalidraw MIT)。
 */
import { describe, it, expect } from "vitest";
import {
  parseCanvasContent,
  serializeCanvasContent,
  isCanvasPath,
  isLegacyTldrawCanvas,
  canvasDocFromExcalidraw,
  CANVAS_SCHEMA_VERSION,
  CANVAS_ENGINE,
} from "./canvas";

const DOC = {
  openLlmWikiCanvas: CANVAS_SCHEMA_VERSION,
  engine: CANVAS_ENGINE,
  elements: [{ id: "a", type: "rectangle" }],
  appState: { theme: "dark" },
  files: {},
};

describe("isLegacyTldrawCanvas", () => {
  it("识别 tldraw {document,session}", () => {
    expect(
      isLegacyTldrawCanvas(
        JSON.stringify({ document: { store: {} }, session: {} }),
      ),
    ).toBe(true);
  });
  it("新 schema 不算 legacy", () => {
    expect(isLegacyTldrawCanvas(JSON.stringify(DOC))).toBe(false);
  });
  it("空串 / 非法 → false", () => {
    expect(isLegacyTldrawCanvas("")).toBe(false);
    expect(isLegacyTldrawCanvas("not json")).toBe(false);
  });
});

describe("parseCanvasContent", () => {
  it("空串 → null", () => {
    expect(parseCanvasContent("")).toBeNull();
    expect(parseCanvasContent("   ")).toBeNull();
  });
  it("非 JSON → null", () => {
    expect(parseCanvasContent("not json")).toBeNull();
  });
  it("legacy tldraw → 'legacy'", () => {
    expect(
      parseCanvasContent(
        JSON.stringify({ document: { store: {} }, session: {} }),
      ),
    ).toBe("legacy");
  });
  it("合法新 schema → 文档", () => {
    const got = parseCanvasContent(JSON.stringify(DOC));
    expect(got).toEqual(DOC);
  });
  it("缺 engine / elements → null", () => {
    expect(
      parseCanvasContent(
        JSON.stringify({ openLlmWikiCanvas: 1, engine: "excalidraw" }),
      ),
    ).toBeNull();
  });
});

describe("serializeCanvasContent round-trip", () => {
  it("parse(serialize(x)) ≈ x", () => {
    const s = serializeCanvasContent(DOC);
    expect(parseCanvasContent(s)).toEqual(DOC);
  });
  it("美化 JSON", () => {
    const out = serializeCanvasContent(DOC);
    expect(out).toContain("\n  ");
    expect(out).toContain('"engine": "excalidraw"');
  });
});

describe("canvasDocFromExcalidraw", () => {
  it("只保留可持久化 appState 键", () => {
    const d = canvasDocFromExcalidraw(
      [{ id: "1" }],
      { theme: "light", collaborators: new Map(), zoom: { value: 1 } },
      { f1: { id: "f1" } },
    );
    expect(d.elements).toHaveLength(1);
    expect(d.appState.theme).toBe("light");
    expect(d.appState.zoom).toEqual({ value: 1 });
    expect(d.appState.collaborators).toBeUndefined();
    expect(d.files.f1).toEqual({ id: "f1" });
  });
});

describe("isCanvasPath", () => {
  it("大小写后缀都认", () => {
    expect(isCanvasPath("a.canvas")).toBe(true);
    expect(isCanvasPath("a/b/CANVAS.CANVAS")).toBe(true);
  });
  it("非 .canvas → false", () => {
    expect(isCanvasPath("a.md")).toBe(false);
    expect(isCanvasPath("")).toBe(false);
  });
});
