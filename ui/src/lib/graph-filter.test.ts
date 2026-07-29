import { describe, it, expect } from "vitest";
import {
  applyGraphFilters,
  distinctTags,
  distinctTypes,
  type GraphFilters,
} from "./graph-filter";
import type { EdgeOut, NodeOut } from "./ipc";

const NODES: NodeOut[] = [
  { id: 0, path: "a.md", title: "A", type: "Concept", tags: ["x"], status: null, created: null, modified: 0, preview: "" },
  { id: 1, path: "b.md", title: "B", type: "Source", tags: ["y"], status: null, created: null, modified: 0, preview: "" },
  { id: 2, path: "c.md", title: "C", type: "Concept", tags: [], status: null, created: null, modified: 0, preview: "" }, // 孤儿
  { id: 3, path: "d.md", title: "D", type: null, tags: [], status: null, created: null, modified: 0, preview: "" }, // 无 type
];
const EDGES: EdgeOut[] = [
  { from: 0, to: 1, kind: "wiki", relation: null, unresolved: null, anchor: null },
  { from: 0, to: 3, kind: "relation", relation: "mentions", unresolved: null, anchor: null },
  { from: 1, to: null, kind: "wiki", relation: null, unresolved: "Ghost", anchor: null },
];

const base: GraphFilters = {
  types: new Set(),
  tags: new Set(),
  relations: new Set(),
  hideOrphans: false,
  focusId: null,
  hops: 1,
};

describe("applyGraphFilters — 空过滤", () => {
  it("放行全部节点与边(含悬空边)", () => {
    const r = applyGraphFilters(NODES, EDGES, base);
    expect([...r.nodeIds].sort()).toEqual([0, 1, 2, 3]);
    expect(r.edges).toHaveLength(3);
  });
});

describe("applyGraphFilters — type 过滤", () => {
  it("只保留 Concept,边按端点裁剪", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, types: new Set(["Concept"]) });
    expect([...r.nodeIds].sort()).toEqual([0, 2]);
    expect(r.edges).toHaveLength(0);
  });
});

describe("applyGraphFilters — tag 过滤", () => {
  it("只保留带 tag x 的节点", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, tags: new Set(["x"]) });
    expect([...r.nodeIds]).toEqual([0]);
  });
});

describe("applyGraphFilters — relation 过滤", () => {
  it("只保留 wiki 边,节点不变", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, relations: new Set(["wiki"]) });
    expect(r.nodeIds.size).toBe(4);
    expect(r.edges.every((e) => e.kind === "wiki")).toBe(true);
    expect(r.edges).toHaveLength(2);
  });
});

describe("applyGraphFilters — 孤儿隐藏", () => {
  it("隐藏无连接节点,保留有边的", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, hideOrphans: true });
    expect([...r.nodeIds].sort()).toEqual([0, 1, 3]);
    expect(r.edges).toHaveLength(3);
  });
});

describe("applyGraphFilters — 邻域收窄", () => {
  it("focus B、1 跳:只留 B 及其邻居", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, focusId: 1, hops: 1 });
    expect([...r.nodeIds].sort()).toEqual([0, 1]);
  });

  it("focus 孤儿 C:只留 C,无边", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, focusId: 2, hops: 1 });
    expect([...r.nodeIds]).toEqual([2]);
    expect(r.edges).toHaveLength(0);
  });

  it("focus 2 跳:从 B 可达 A 的另一邻居 D", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, focusId: 1, hops: 2 });
    expect([...r.nodeIds].sort()).toEqual([0, 1, 3]);
  });

  it("focus 不存在 → 空", () => {
    const r = applyGraphFilters(NODES, EDGES, { ...base, focusId: 99, hops: 1 });
    expect(r.nodeIds.size).toBe(0);
  });
});

describe("distinct 辅助", () => {
  it("distinctTypes 去重并含 null 占位", () => {
    // em dash(—)码点在 ASCII 之后,默认排序落在最后。
    expect(distinctTypes(NODES).sort()).toEqual(["Concept", "Source", "—"]);
  });
  it("distinctTags 去重", () => {
    expect(distinctTags(NODES).sort()).toEqual(["x", "y"]);
  });
});
