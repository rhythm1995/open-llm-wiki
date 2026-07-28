import { describe, expect, it } from "vitest";
import { mockSearch, type SearchDoc } from "./mock-search";

const docs: SearchDoc[] = [
  { id: 0, title: "Zettelkasten", body: "atomic notes, links over hierarchy" },
  { id: 1, title: "Index", body: "see zettelkasten and evergreen" },
  { id: 2, title: "Misc", body: "nothing relevant here" },
];

describe("mockSearch", () => {
  it("空查询返回空", () => {
    expect(mockSearch(docs, "")).toEqual([]);
    expect(mockSearch(docs, "   ")).toEqual([]);
  });
  it("单命中:返回匹配文档", () => {
    const r = mockSearch(docs, "atomic");
    expect(r.map((x) => x.id)).toEqual([0]);
  });
  it("AND 语义:所有词都要命中", () => {
    // 0 命中 atomic,但不含 evergreen → 排除;1 含 zettelkasten + evergreen → 命中
    const r = mockSearch(docs, "atomic evergreen");
    expect(r.map((x) => x.id)).toEqual([]);
    const r2 = mockSearch(docs, "zettelkasten evergreen");
    expect(r2.map((x) => x.id)).toEqual([1]);
  });
  it("标题权重 ×2:标题命中排在仅正文命中之前", () => {
    const mixed: SearchDoc[] = [
      { id: 0, title: "Foo", body: "zzz" },
      { id: 1, title: "zzz", body: "foo foo" },
    ];
    const r = mockSearch(mixed, "foo");
    expect(r[0].id).toBe(0); // 标题命中 score=2 > 正文命中 score=1
    expect(r[1].id).toBe(1);
  });
  it("结果按分降序", () => {
    const r = mockSearch(docs, "zettelkasten");
    // 0 标题命中(2),1 正文命中(1)
    expect(r.map((x) => x.score)).toEqual([2, 1]);
  });
  it("大小写不敏感", () => {
    expect(mockSearch(docs, "ZETTELKASTEN").map((x) => x.id)).toEqual([0, 1]);
  });
});
