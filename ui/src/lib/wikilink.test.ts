import { describe, it, expect } from "vitest";
import { filterByTitles, nodeWikilink, openLinkContext, parseLinkInner, resolveTitleForTarget, resolveWikiTarget } from "./wikilink";
import type { NodeOut } from "./ipc";

const N = (id: number, path: string, title: string): NodeOut => ({
  id,
  path,
  title,
  type: null,
  tags: [],
  status: null,
  created: null,
  modified: 0,
  preview: "",
});

const NODES: NodeOut[] = [
  N(0, "index.md", "Index"),
  N(1, "dir/the-note.md", "The Note"),
  N(2, "sub/gamma.md", "Gamma Real"),
];

describe("parseLinkInner", () => {
  it("splits target / alias / anchor", () => {
    expect(parseLinkInner("Foo|display")).toEqual({ target: "Foo", anchor: null });
    expect(parseLinkInner("Foo#sec")).toEqual({ target: "Foo", anchor: "sec" });
    // anchor 属于 target 侧,alias 在 | 后被忽略(Obsidian 的 [[target#anchor|alias]] 形)。
    expect(parseLinkInner("Foo#sec|display")).toEqual({ target: "Foo", anchor: "sec" });
    expect(parseLinkInner("  Foo  ")).toEqual({ target: "Foo", anchor: null });
  });
});

describe("resolveWikiTarget", () => {
  it("resolves by title (case-insensitive)", () => {
    expect(resolveWikiTarget("index", NODES)).toBe("index.md");
    expect(resolveWikiTarget("The Note", NODES)).toBe("dir/the-note.md");
  });
  it("resolves by full path stem", () => {
    expect(resolveWikiTarget("dir/the-note", NODES)).toBe("dir/the-note.md");
  });
  it("resolves by bare file stem (cross-dir)", () => {
    expect(resolveWikiTarget("gamma", NODES)).toBe("sub/gamma.md");
  });
  it("title wins over an ambiguous file stem", () => {
    const nodes = [
      N(0, "x.md", "shared"),
      N(1, "dir/shared.md", "Other"),
    ];
    expect(resolveWikiTarget("shared", nodes)).toBe("x.md");
  });
  it("returns null when unresolved", () => {
    expect(resolveWikiTarget("Ghost", NODES)).toBeNull();
  });
  it("returns null for empty target", () => {
    expect(resolveWikiTarget("", NODES)).toBeNull();
    expect(resolveWikiTarget("   ", NODES)).toBeNull();
  });
});

describe("resolveTitleForTarget", () => {
  it("returns the node title on title hit", () => {
    expect(resolveTitleForTarget("The Note", NODES)).toBe("The Note");
  });
  it("resolves a bare file stem to the node title", () => {
    expect(resolveTitleForTarget("gamma", NODES)).toBe("Gamma Real");
  });
  it("resolves a path stem to the node title", () => {
    expect(resolveTitleForTarget("dir/the-note", NODES)).toBe("The Note");
  });
  it("falls back to the raw target when unresolved", () => {
    expect(resolveTitleForTarget("Ghost", NODES)).toBe("Ghost");
  });
  it("falls back on empty / whitespace target", () => {
    expect(resolveTitleForTarget("", NODES)).toBe("");
    expect(resolveTitleForTarget("   ", NODES)).toBe("   ");
  });
});

describe("openLinkContext", () => {
  it("detects an open [[ being typed", () => {
    expect(openLinkContext("hello [[foo")).toEqual({ typed: "foo", innerStart: 8 });
  });
  it("empty typed right after [[", () => {
    expect(openLinkContext("[[")).toEqual({ typed: "", innerStart: 2 });
  });
  it("returns null when the link is already closed", () => {
    expect(openLinkContext("[[foo]]")).toBeNull();
  });
  it("returns null in alias / anchor region", () => {
    expect(openLinkContext("[[foo|disp")).toBeNull();
    expect(openLinkContext("[[foo#sec")).toBeNull();
  });
  it("returns null when there is no [[", () => {
    expect(openLinkContext("plain text")).toBeNull();
  });
});

describe("filterByTitles", () => {
  it("case-insensitive substring match", () => {
    expect(filterByTitles(["Foo", "Bar", "foobar"], "foo")).toEqual(["Foo", "foobar"]);
  });
  it("empty typed returns all (deduped)", () => {
    expect(filterByTitles(["A", "B", "A"], "")).toEqual(["A", "B"]);
  });
});

describe("nodeWikilink", () => {
  it("正常标题 → [[标题]]", () => {
    expect(nodeWikilink("活跃概念", "notes/a.md")).toBe("[[活跃概念]]");
  });
  it("空标题 → 回退文件名 stem", () => {
    expect(nodeWikilink("", "notes/foo-bar.md")).toBe("[[foo-bar]]");
    expect(nodeWikilink("   ", "x.md")).toBe("[[x]]");
  });
  it('标题含 ]/|/#(破坏链接语法)→ 回退文件名 stem', () => {
    expect(nodeWikilink("a [b", "notes/c.md")).toBe("[[c]]");
    expect(nodeWikilink("a|b", "notes/c.md")).toBe("[[c]]");
    expect(nodeWikilink("a#b", "notes/c.md")).toBe("[[c]]");
  });
  it("标题去首尾空白", () => {
    expect(nodeWikilink("  活跃  ", "a.md")).toBe("[[活跃]]");
  });
  it("无扩展名的路径:fileStem 保留全名", () => {
    expect(nodeWikilink("", "README")).toBe("[[README]]");
  });
});
