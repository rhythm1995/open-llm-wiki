import { describe, expect, it } from "vitest";
import { mockEvalQql, type MockQqlNode } from "./mock-qql";

const nodes: MockQqlNode[] = [
  {
    id: 1,
    title: "A",
    type: "Concept",
    tags: ["x"],
    status: "Active",
    path: "a.md",
  },
  {
    id: 2,
    title: "B",
    type: "Note",
    tags: ["y"],
    status: null,
    path: "b.md",
  },
  {
    id: 3,
    title: "C",
    type: "Concept",
    tags: ["x", "z"],
    status: "Draft",
    path: "c.md",
  },
];

describe("mockEvalQql", () => {
  it("WHERE type + List", () => {
    const r = mockEvalQql(`WHERE type = "Concept"`, nodes);
    expect(r).toEqual({ List: [1, 3] });
  });

  it("LIMIT", () => {
    const r = mockEvalQql(`WHERE type = "Concept" LIMIT 1`, nodes);
    expect(r).toEqual({ List: [1] });
  });

  it("COUNT", () => {
    const r = mockEvalQql(`WHERE type = "Concept" COUNT`, nodes);
    expect(r).toEqual({ Count: 2 });
  });

  it("GROUP BY type", () => {
    const r = mockEvalQql(`GROUP BY type`, nodes);
    expect(r).toHaveProperty("Groups");
    if ("Groups" in r) {
      expect(r.Groups.find((g) => g.key === "Concept")?.count).toBe(2);
    }
  });

  it("RENDER histogram(type)", () => {
    const r = mockEvalQql(`RENDER histogram(type)`, nodes);
    expect(r).toHaveProperty("Histogram");
  });

  it("SHOW → Table", () => {
    const r = mockEvalQql(`WHERE type = "Note" SHOW title, type`, nodes);
    expect(r).toEqual({
      Table: [{ id: 2, fields: ["B", "Note"] }],
    });
  });

  it("tag 过滤", () => {
    const r = mockEvalQql(`WHERE tags = "x"`, nodes);
    expect(r).toEqual({ List: [1, 3] });
  });

  it("空查询 → 空 List", () => {
    expect(mockEvalQql("", nodes)).toEqual({ List: [] });
  });

  it("IN / CONTAINS / STARTSWITH", () => {
    expect(mockEvalQql(`WHERE type IN ("Note")`, nodes)).toEqual({
      List: [2],
    });
    expect(mockEvalQql(`WHERE title CONTAINS "A"`, nodes)).toEqual({
      List: [1],
    });
    expect(mockEvalQql(`WHERE path STARTSWITH "a"`, nodes)).toEqual({
      List: [1],
    });
  });

  it("AND / OR", () => {
    expect(
      mockEvalQql(`WHERE type = "Concept" AND tags = "x"`, nodes),
    ).toEqual({ List: [1, 3] });
    expect(
      mockEvalQql(`WHERE type = "Note" OR title CONTAINS "A"`, nodes),
    ).toEqual({ List: [2, 1] });
  });
});
