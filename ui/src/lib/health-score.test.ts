import { describe, expect, it } from "vitest";
import {
  censusFromSnapshot,
  frontierCandidates,
  graphBadge,
  hungerTarget,
  inboundDegrees,
  nextAction,
  recencyWeight,
  trustLooksUninstrumented,
  type CensusEdge,
  type CensusNode,
} from "./health-score";

const N = (
  id: number,
  type: string | null,
  status: string | null,
  title = `n${id}`,
): CensusNode => ({
  id,
  path: `${title}.md`,
  title,
  type,
  status,
});

describe("hungerTarget", () => {
  it("Contested 要 3,其余 2", () => {
    expect(hungerTarget("Contested")).toBe(3);
    expect(hungerTarget("contested")).toBe(3);
    expect(hungerTarget("Active")).toBe(2);
    expect(hungerTarget(null)).toBe(2);
    expect(hungerTarget("")).toBe(2);
  });
});

describe("inboundDegrees", () => {
  it("只计已解析入边", () => {
    const nodes = [N(1, "Concept", "Active"), N(2, "Summary", "Active")];
    const edges: CensusEdge[] = [
      { from: 2, to: 1 },
      { from: 2, to: 1 },
      { from: 1, to: null },
      { from: 2, to: 99 },
    ];
    const deg = inboundDegrees(nodes, edges);
    expect(deg.get(1)).toBe(2);
    expect(deg.get(2)).toBe(0);
  });
});

describe("censusFromSnapshot", () => {
  const nodes: CensusNode[] = [
    N(1, "Source", "Digested", "S1"),
    N(2, "Source", "Unprocessed", "S2"),
    N(3, "Summary", "Active", "Sum"),
    N(4, "Concept", "Active", "Fed"),
    N(5, "Concept", "Active", "Thin"),
    N(6, "Concept", "Contested", "Fight"),
    N(7, "Entity", null, "Ghost"),
    N(8, "Note", null, "Index"),
    N(9, "Type", null, "SourceType"),
  ];
  const edges: CensusEdge[] = [
    { from: 3, to: 4 },
    { from: 3, to: 4 },
    { from: 3, to: 6 },
    { from: 3, to: 6 },
  ];

  const c = censusFromSnapshot(nodes, edges);

  it("按 type 计数,操作系统 Type/Note 不进主张", () => {
    expect(c.sources.total).toBe(2);
    expect(c.sources.digested).toBe(1);
    expect(c.sources.unprocessed).toBe(1);
    expect(c.concepts.total).toBe(3);
    expect(c.concepts.contested).toBe(1);
    expect(c.entities.total).toBe(1);
    expect(c.wikiPages).toBe(5); // 3 concept + 1 entity + 1 summary
  });

  it("孤儿 = 主张/实体入度 0", () => {
    // Thin depth 0, Ghost depth 0
    expect(c.orphans).toBe(2);
  });

  it("饥饿:Active 深度 2 达标;Contested 深度 2 未达标", () => {
    // Fed depth 2 Active → ok; Thin 0 Active → hungry; Fight 2 Contested target 3 → hungry
    expect(c.hungry).toBe(2);
    expect(c.singleSource).toBe(1); // only Thin depth < 2
    expect(c.hungriest.map((h) => h.title)).toEqual(["Thin", "Fight"]);
    expect(c.hungriest[0].target).toBe(2);
    expect(c.hungriest[1].target).toBe(3);
  });

  it("graphBadge 用普查", () => {
    expect(graphBadge("contested", c)).toBe(1);
    expect(graphBadge("orphans", c)).toBe(2);
    expect(graphBadge("hunger", c)).toBe(2);
    expect(graphBadge("synthesis", c)).toBe(1);
    expect(graphBadge("drift", c)).toBeUndefined();
  });
});

describe("nextAction", () => {
  const base = censusFromSnapshot([], []);
  it("先争议,再孤儿,再饥饿", () => {
    expect(nextAction({ ...base, concepts: { ...base.concepts, contested: 1 } })).toBe(
      "contested",
    );
    expect(nextAction({ ...base, orphans: 2 })).toBe("orphans");
    expect(nextAction({ ...base, hungry: 3 })).toBe("hunger");
    expect(nextAction({ ...base, singleSource: 1 })).toBe("synthesis");
    expect(nextAction(base)).toBe("ok");
  });
});

describe("recencyWeight / frontierCandidates", () => {
  const now = Date.UTC(2026, 7, 17);
  it("30 天内满权,更旧衰减有地板", () => {
    expect(recencyWeight(now, now)).toBe(1);
    expect(recencyWeight(now - 10 * 86_400_000, now)).toBe(1);
    expect(recencyWeight(0, now)).toBe(0.5);
    expect(recencyWeight(now - 400 * 86_400_000, now)).toBe(0.25);
  });
  it("出边多于入边的主张进名单,按分数降序", () => {
    const nodes: CensusNode[] = [
      { ...N(1, "Concept", "Active", "Hub"), modified: now },
      { ...N(2, "Concept", "Active", "Sink"), modified: now },
      { ...N(3, "Summary", "Active", "Sum"), modified: now },
    ];
    const edges: CensusEdge[] = [
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 3, to: 2 },
    ];
    const f = frontierCandidates(nodes, edges, now);
    expect(f.map((x) => x.title)).toEqual(["Hub"]);
    expect(f[0].outDeg).toBe(2);
    expect(f[0].inDeg).toBe(0);
    expect(f[0].score).toBe(2);
  });

  it("只收主张/实体;未解析出边不计;score≤0 剔除", () => {
    const nodes: CensusNode[] = [
      { ...N(1, "Concept", "Active", "Spoke"), modified: now },
      { ...N(2, "Source", "Digested", "Src"), modified: now },
      { ...N(3, "Entity", null, "Org"), modified: now },
    ];
    const edges: CensusEdge[] = [
      { from: 1, to: null },
      { from: 2, to: 1 },
      { from: 1, to: 3 },
    ];
    const f = frontierCandidates(nodes, edges, now);
    expect(f.map((x) => x.title)).toEqual([]);
  });

  it("更近的同样出超入排在前面", () => {
    const nodes: CensusNode[] = [
      { ...N(1, "Concept", "Active", "OldHub"), modified: now - 400 * 86_400_000 },
      { ...N(2, "Concept", "Active", "NewHub"), modified: now },
      { ...N(3, "Concept", "Active", "A"), modified: now },
      { ...N(4, "Concept", "Active", "B"), modified: now },
    ];
    const edges: CensusEdge[] = [
      { from: 1, to: 3 },
      { from: 2, to: 4 },
    ];
    const f = frontierCandidates(nodes, edges, now);
    expect(f[0].title).toBe("NewHub");
    expect(f[0].score).toBeGreaterThan(f[1].score);
  });
});

describe("trustLooksUninstrumented", () => {
  it("drift 盖过 80% wiki 页 → 字段噪音", () => {
    expect(trustLooksUninstrumented(16, 20)).toBe(true);
    expect(trustLooksUninstrumented(5, 20)).toBe(false);
    expect(trustLooksUninstrumented(undefined, 20)).toBe(false);
    expect(trustLooksUninstrumented(0, 0)).toBe(false);
  });
});
