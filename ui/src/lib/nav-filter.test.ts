import { describe, it, expect } from "vitest";
import { filterByNav, isInbox, sameSelection, type NavSelection } from "./nav-filter";
import type { NodeOut } from "./ipc";

// 与 wikilink.test.ts 同款的 per-file helper(本库约定:每文件自带 N)。
const N = (id: number, path: string, title: string, type: string | null): NodeOut => ({
  id,
  path,
  title,
  type,
  tags: [],
  status: null,
  created: null,
  modified: 0,
  preview: "",
});

const NODES: NodeOut[] = [
  N(0, "index.md", "Index", "Note"),
  N(1, "zettelkasten.md", "Zettelkasten", "Concept"),
  N(2, "evergreen.md", "Evergreen", "Concept"),
  N(3, "sources/karpathy.md", "Karpathy", "Source"),
  N(4, "scratch.md", "Scratch", null), // 未分类 → inbox
  N(5, "sub/deep/nested.md", "Nested", "Note"),
];

describe("isInbox", () => {
  it("type 缺失 → true;有 type → false", () => {
    expect(isInbox(NODES[4])).toBe(true);
    expect(isInbox(NODES[0])).toBe(false);
  });
});

describe("filterByNav — all", () => {
  it("放行全部", () => {
    expect(filterByNav(NODES, { kind: "all" })).toHaveLength(6);
  });
});

describe("filterByNav — inbox", () => {
  it("只留未分类(type 缺失)", () => {
    const r = filterByNav(NODES, { kind: "inbox" });
    expect(r.map((n) => n.id)).toEqual([4]);
  });
});

describe("filterByNav — type", () => {
  it("按 type 字面量过滤", () => {
    const r = filterByNav(NODES, { kind: "type", id: "Concept" });
    expect(r.map((n) => n.id).sort()).toEqual([1, 2]);
  });
  it('id:"" → 未分类(与 inbox 等价)', () => {
    const r = filterByNav(NODES, { kind: "type", id: "" });
    expect(r.map((n) => n.id)).toEqual([4]);
  });
});

describe("filterByNav — folder", () => {
  it("前缀匹配:含子目录与文件", () => {
    const r = filterByNav(NODES, { kind: "folder", id: "sources" });
    expect(r.map((n) => n.path)).toEqual(["sources/karpathy.md"]);
  });
  it("递归子目录也命中", () => {
    const r = filterByNav(NODES, { kind: "folder", id: "sub" });
    expect(r.map((n) => n.path)).toEqual(["sub/deep/nested.md"]);
  });
});

describe("filterByNav — query", () => {
  it("返回空(由 NoteListView 单独跑 ipc.runQql)", () => {
    expect(filterByNav(NODES, { kind: "query", id: "queries/x.md" })).toEqual([]);
  });
});

describe("filterByNav — archive", () => {
  it("返回空(归档数据来自 git 历史;NoteListView 委派给 ArchiveView)", () => {
    expect(filterByNav(NODES, { kind: "archive" })).toEqual([]);
  });
});

describe("sameSelection", () => {
  const cases: [NavSelection, NavSelection, boolean][] = [
    [{ kind: "all" }, { kind: "all" }, true],
    [{ kind: "inbox" }, { kind: "all" }, false],
    [{ kind: "archive" }, { kind: "archive" }, true],
    [{ kind: "archive" }, { kind: "inbox" }, false],
    [{ kind: "type", id: "Concept" }, { kind: "type", id: "Concept" }, true],
    [{ kind: "type", id: "Concept" }, { kind: "type", id: "Source" }, false],
    [{ kind: "folder", id: "a" }, { kind: "folder", id: "b" }, false],
    [{ kind: "query", id: "q" }, { kind: "query", id: "q" }, true],
  ];
  for (const [a, b, want] of cases) {
    it(`${JSON.stringify(a)} vs ${JSON.stringify(b)} → ${want}`, () => {
      expect(sameSelection(a, b)).toBe(want);
      // null 永不相等
      expect(sameSelection(null, b)).toBe(false);
    });
  }
});
