import { describe, it, expect } from "vitest";
import { filterByTitles, openLinkContext, parseLinkInner, resolveWikiTarget } from "./wikilink";
import type { NodeOut } from "./ipc";

const N = (id: number, path: string, title: string): NodeOut => ({
  id,
  path,
  title,
  type: null,
  tags: [],
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
