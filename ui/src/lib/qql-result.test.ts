import { describe, expect, it } from "vitest";
import {
  combinedBadge,
  emphasizeGroups,
  flattenResult,
  resultBadge,
} from "./qql-result";

const nodes = [
  { id: 0, path: "a.md", title: "Alpha" },
  { id: 1, path: "b.md", title: "Beta" },
];

describe("emphasizeGroups", () => {
  it("dim 不丢行", () => {
    const rows = emphasizeGroups(
      [
        { key: "dup", count: 2, ids: [0, 1] },
        { key: "solo", count: 1, ids: [0] },
      ],
      2,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].dimmed).toBe(false);
    expect(rows[1].dimmed).toBe(true);
  });
});

describe("flattenResult", () => {
  it("空 List → empty", () => {
    expect(flattenResult({ List: [] }, nodes, ["title"])).toEqual({
      kind: "empty",
    });
  });

  it("List 拼 path/title", () => {
    const v = flattenResult({ List: [1] }, nodes, ["title"]);
    expect(v.kind).toBe("notes");
    if (v.kind === "notes") {
      expect(v.rows[0]).toMatchObject({
        path: "b.md",
        title: "Beta",
        cells: ["Beta"],
      });
    }
  });

  it("缺 id: path null, title #id", () => {
    const v = flattenResult({ List: [9] }, nodes, ["title"]);
    if (v.kind === "notes") {
      expect(v.rows[0]).toEqual({
        id: 9,
        path: null,
        title: "#9",
        cells: [null],
      });
    }
  });

  it("Table 按 columns 对齐 fields", () => {
    const v = flattenResult(
      { Table: [{ id: 0, fields: ["Alpha", "2"] }] },
      nodes,
      ["title", "depth"],
    );
    if (v.kind === "notes") {
      expect(v.columns).toEqual(["title", "depth"]);
      expect(v.rows[0].cells).toEqual(["Alpha", "2"]);
    }
  });

  it("Groups 走 emphasize", () => {
    const v = flattenResult(
      { Groups: [{ key: "x", count: 1, ids: [0] }] },
      nodes,
      [],
      2,
    );
    expect(v.kind).toBe("groups");
    if (v.kind === "groups") {
      expect(v.rows[0].dimmed).toBe(true);
      expect(v.minCount).toBe(2);
    }
  });

  it("Count / Sum → scalar", () => {
    expect(flattenResult({ Count: 4 }, nodes, [])).toEqual({
      kind: "scalar",
      label: "count",
      value: 4,
    });
    expect(flattenResult({ Sum: 1.5 }, nodes, [])).toEqual({
      kind: "scalar",
      label: "sum",
      value: 1.5,
    });
  });
});

describe("resultBadge / combinedBadge", () => {
  it("notes / empty / error / groups / scalar", () => {
    expect(
      resultBadge({
        kind: "notes",
        columns: ["title"],
        rows: [
          { id: 0, path: "a.md", title: "A", cells: ["A"] },
          { id: 1, path: "b.md", title: "B", cells: ["B"] },
        ],
      }),
    ).toBe(2);
    expect(resultBadge({ kind: "empty" })).toBe(0);
    expect(resultBadge({ kind: "error", message: "x" })).toBe("!");
    expect(resultBadge({ kind: "scalar", label: "count", value: 3.9 })).toBe(3);
    expect(
      resultBadge(
        {
          kind: "groups",
          minCount: 2,
          rows: [
            { key: "a", count: 2, ids: [], dimmed: false },
            { key: "b", count: 1, ids: [], dimmed: true },
          ],
        },
        2,
      ),
    ).toBe(1);
  });

  it("stale-sources 两段相加", () => {
    expect(
      combinedBadge([
        { kind: "empty" },
        {
          kind: "notes",
          columns: ["title"],
          rows: [{ id: 0, path: "a.md", title: "A", cells: ["A"] }],
        },
      ]),
    ).toBe(1);
    expect(
      combinedBadge([
        { kind: "error", message: "x" },
        { kind: "empty" },
      ]),
    ).toBe("!");
  });
});
