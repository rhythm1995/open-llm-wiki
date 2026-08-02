import { describe, expect, it } from "vitest";
import type { NodeOut } from "./ipc";
import { extractWikilinkInners, findBrokenWikilinks } from "./broken-links";

const nodes: NodeOut[] = [
  {
    id: 0,
    path: "a.md",
    title: "Alpha",
    type: null,
    tags: [],
    status: null,
    created: null,
    modified: 0,
    preview: "",
  },
];

describe("extractWikilinkInners", () => {
  it("抽出正文链接,跳过代码", () => {
    const md = "see [[Alpha]] and [[Missing]]\n\n```\n[[Code]]\n```\n`[[tick]]`\n";
    expect(extractWikilinkInners(md)).toEqual(["Alpha", "Missing"]);
  });
});

describe("findBrokenWikilinks", () => {
  it("只报未解析", () => {
    const b = findBrokenWikilinks("[[Alpha]] [[Nope]] [[Alpha|x]]", nodes);
    expect(b.map((x) => x.target)).toEqual(["Nope"]);
  });
  it("空 / 全解析", () => {
    expect(findBrokenWikilinks("", nodes)).toEqual([]);
    expect(findBrokenWikilinks("[[Alpha]]", nodes)).toEqual([]);
  });
});
