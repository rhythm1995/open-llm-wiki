import { describe, it, expect } from "vitest";
import { groupBacklinks, type BacklinkItem } from "./backlinks";
import type { EdgeOut, NodeOut } from "./ipc";

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

const E = (
  from: number,
  to: number,
  kind: "wiki" | "relation",
  relation: string | null = null,
): EdgeOut => ({
  from,
  to,
  unresolved: null,
  kind,
  relation,
  anchor: null,
});

const BL = (
  from: NodeOut,
  kind: "wiki" | "relation",
  relation: string | null = null,
): BacklinkItem => ({
  from,
  edge: E(from.id, 99, kind, relation),
});

describe("groupBacklinks", () => {
  it("empty → []", () => {
    expect(groupBacklinks([])).toEqual([]);
  });

  it("single wiki edge stays one group", () => {
    const a = N(1, "a.md", "Alpha");
    const out = groupBacklinks([BL(a, "wiki")]);
    expect(out).toHaveLength(1);
    expect(out[0].from.id).toBe(1);
    expect(out[0].kinds).toEqual(["wiki"]);
    expect(out[0].relations).toEqual([]);
    expect(out[0].count).toBe(1);
  });

  it("same from wiki+relation merge into one group", () => {
    const a = N(1, "a.md", "Alpha");
    const out = groupBacklinks([BL(a, "wiki"), BL(a, "relation", "related")]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].kinds).toEqual(["wiki", "relation"]);
    expect(out[0].relations).toEqual(["related"]);
  });

  it("wiki kind is ordered before relation even if relation arrives first", () => {
    const a = N(1, "a.md", "Alpha");
    const out = groupBacklinks([
      BL(a, "relation", "mentioned_in"),
      BL(a, "wiki"),
    ]);
    expect(out[0].kinds).toEqual(["wiki", "relation"]);
    expect(out[0].relations).toEqual(["mentioned_in"]);
  });

  it("dedupes repeated relation names, keeps insertion order", () => {
    const a = N(1, "a.md", "Alpha");
    const out = groupBacklinks([
      BL(a, "relation", "related"),
      BL(a, "relation", "mentioned_in"),
      BL(a, "relation", "related"),
    ]);
    expect(out[0].count).toBe(3);
    expect(out[0].relations).toEqual(["related", "mentioned_in"]);
    expect(out[0].kinds).toEqual(["relation"]);
  });

  it("different from stay separate, sorted by title", () => {
    const zeta = N(2, "z.md", "Zeta");
    const alpha = N(1, "a.md", "Alpha");
    const out = groupBacklinks([BL(zeta, "wiki"), BL(alpha, "wiki")]);
    expect(out.map((g) => g.from.title)).toEqual(["Alpha", "Zeta"]);
  });
});
