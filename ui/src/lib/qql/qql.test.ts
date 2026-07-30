import { describe, expect, it } from "vitest";
import { parseQql, QqlParseError } from "./parse";
import { evalQql } from "./eval";
import { runQqlTs } from "./index";
import type { QqlNote } from "./types";

function note(
  partial: Partial<QqlNote> & { id: number; title: string },
): QqlNote {
  return {
    path: `${partial.title.toLowerCase()}.md`,
    body: "",
    frontmatter: {},
    tags: [],
    type: null,
    backlinkCount: 0,
    linkCount: 0,
    ...partial,
  };
}

const sample: QqlNote[] = [
  note({
    id: 0,
    title: "Alpha",
    type: "Concept",
    tags: ["method"],
    frontmatter: { status: "Active", score: 3 },
    path: "alpha.md",
    body: "hello world",
    linkCount: 2,
    backlinkCount: 1,
  }),
  note({
    id: 1,
    title: "Beta",
    type: "Note",
    tags: ["meta"],
    frontmatter: { status: "Done" },
    path: "folder/beta.md",
    body: "other",
  }),
  note({
    id: 2,
    title: "Gamma",
    type: "Concept",
    tags: ["method", "ai"],
    frontmatter: { status: "Active", score: 10 },
    path: "gamma.md",
    body: "concept body",
    linkCount: 0,
  }),
];

describe("parseQql", () => {
  it("空串 → 全量 list", () => {
    const q = parseQql("");
    expect(q.filter.kind).toBe("all");
    expect(q.render.kind).toBe("list");
  });

  it("type eq + count", () => {
    const q = parseQql('WHERE type = "Concept" RENDER count');
    expect(q.filter.kind).toBe("cmp");
    expect(q.render.kind).toBe("count");
  });

  it("AND / OR / NOT / #tag", () => {
    const q = parseQql('WHERE type = "Concept" AND #method OR NOT #meta');
    expect(q.filter.kind).toBe("or");
  });

  it("CONTAINS / STARTSWITH / IN / SORT / LIMIT / SHOW", () => {
    const q = parseQql(
      'WHERE title CONTAINS "a" AND path STARTSWITH "f" AND type IN ("Note", "Concept") SORT title DESC LIMIT 5 SHOW title, type AS t',
    );
    expect(q.limit).toBe(5);
    expect(q.order[0]?.dir).toBe("desc");
    expect(q.select.kind).toBe("fields");
    expect(q.render.kind).toBe("table");
  });

  it("非法 → 抛错", () => {
    expect(() => parseQql("WHERE type =")).toThrow(QqlParseError);
  });
});

describe("evalQql", () => {
  it("type filter + list", () => {
    const rs = evalQql(
      sample,
      parseQql('WHERE type = "Concept" SORT title ASC'),
    );
    expect(rs).toEqual({ List: [0, 2] });
  });

  it("AND tags + count", () => {
    const rs = evalQql(
      sample,
      parseQql('WHERE type = "Concept" AND #method RENDER count'),
    );
    expect(rs).toEqual({ Count: 2 });
  });

  it("CONTAINS body", () => {
    const rs = evalQql(sample, parseQql('WHERE body CONTAINS "hello"'));
    expect(rs).toEqual({ List: [0] });
  });

  it("IN + LIMIT", () => {
    const rs = evalQql(
      sample,
      parseQql('WHERE type IN ("Concept") LIMIT 1 SORT title'),
    );
    expect(rs).toEqual({ List: [0] });
  });

  it("SHOW table", () => {
    const rs = evalQql(
      sample,
      parseQql('WHERE type = "Note" SHOW title, status'),
    );
    expect(rs).toEqual({
      Table: [{ id: 1, fields: ["Beta", "Done"] }],
    });
  });

  it("group_by type", () => {
    const rs = evalQql(sample, parseQql("RENDER group_by(type)"));
    expect(rs).toHaveProperty("Groups");
    if ("Groups" in rs) {
      expect(rs.Groups.map((g) => g.key).sort()).toEqual(["Concept", "Note"]);
    }
  });

  it("histogram status", () => {
    const rs = evalQql(sample, parseQql("RENDER histogram(status)"));
    expect(rs).toHaveProperty("Histogram");
  });

  it("sum score", () => {
    const rs = evalQql(
      sample,
      parseQql('WHERE type = "Concept" RENDER sum(score)'),
    );
    expect(rs).toEqual({ Sum: 13 });
  });

  it("links.len / tags.len", () => {
    const rs = evalQql(sample, parseQql("WHERE links.len() > 0"));
    expect(rs).toEqual({ List: [0] });
  });

  it("path STARTSWITH / ENDSWITH", () => {
    expect(evalQql(sample, parseQql('WHERE path STARTSWITH "folder/"'))).toEqual(
      { List: [1] },
    );
    expect(evalQql(sample, parseQql('WHERE path ENDSWITH "gamma.md"'))).toEqual(
      { List: [2] },
    );
  });
});

describe("runQqlTs", () => {
  it("坏查询 → 空 List", () => {
    expect(runQqlTs("WHERE ((((", sample)).toEqual({ List: [] });
  });
});
