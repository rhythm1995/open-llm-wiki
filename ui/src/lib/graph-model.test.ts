import { describe, expect, it } from "vitest";
import type { EdgeOut, NodeOut } from "./ipc";
import {
  buildGraphModel,
  computeDegree,
  pathKey,
  pinIdsToPaths,
  pinPathsToIds,
  structureSignature,
  topKByDegree,
} from "./graph-model";

function node(id: number, path: string, title = path): NodeOut {
  return {
    id,
    path,
    title,
    type: null,
    tags: [],
    status: null,
    created: null,
    modified: 0,
    preview: "",
  };
}

function edge(from: number, to: number | null): EdgeOut {
  return {
    from,
    to,
    unresolved: to == null ? "x" : null,
    kind: "wiki",
    relation: null,
    anchor: null,
  };
}

describe("pathKey", () => {
  it("统一反斜杠并 trim", () => {
    expect(pathKey("  a\\b/c  ")).toBe("a/b/c");
    expect(pathKey("notes/A.md")).toBe("notes/A.md");
  });
});

describe("buildGraphModel", () => {
  it("建立 byId / byPath 与 degree", () => {
    const m = buildGraphModel(
      [node(1, "a.md"), node(2, "b.md"), node(3, "c.md")],
      [edge(1, 2), edge(1, 3), edge(2, null)],
    );
    expect(m.nodes).toHaveLength(3);
    expect(m.byPath.get("a.md")?.id).toBe(1);
    expect(m.degree.get(1)).toBe(2);
    expect(m.degree.get(2)).toBe(1);
    expect(m.degree.get(3)).toBe(1);
  });
});

describe("computeDegree", () => {
  it("忽略悬空边", () => {
    const d = computeDegree([
      { from: 1, to: 2, unresolved: null, kind: "wiki", relation: null, anchor: null },
      { from: 1, to: null, unresolved: "z", kind: "wiki", relation: null, anchor: null },
    ]);
    expect(d.get(1)).toBe(1);
    expect(d.get(2)).toBe(1);
  });
});

describe("structureSignature", () => {
  it("节点顺序无关", () => {
    const a = structureSignature([1, 2], [{ from: 1, to: 2 }]);
    const b = structureSignature([2, 1], [{ from: 1, to: 2 }]);
    expect(a).toBe(b);
  });
  it("边变化则不同", () => {
    const a = structureSignature([1, 2], [{ from: 1, to: 2 }]);
    const b = structureSignature([1, 2], [{ from: 1, to: null }]);
    expect(a).not.toBe(b);
  });
});

describe("topKByDegree", () => {
  it("≤k 原样", () => {
    expect(topKByDegree([3, 1, 2], new Map([[1, 9]]), 10)).toEqual([3, 1, 2]);
  });
  it("按度数取枢纽", () => {
    const deg = new Map([
      [1, 1],
      [2, 5],
      [3, 5],
      [4, 0],
    ]);
    expect(topKByDegree([1, 2, 3, 4], deg, 2)).toEqual([2, 3]);
  });
});

describe("pin path 往返", () => {
  it("id → path → id 在新模型上恢复", () => {
    const m1 = buildGraphModel([node(10, "x.md"), node(20, "y.md")], []);
    const paths = pinIdsToPaths(new Set([10]), m1.byId);
    expect([...paths]).toEqual(["x.md"]);
    // 模拟 reindex 后 id 变了,path 仍在。
    const m2 = buildGraphModel([node(99, "x.md"), node(1, "y.md")], []);
    const ids = pinPathsToIds(paths, m2.byPath);
    expect([...ids]).toEqual([99]);
  });
});
