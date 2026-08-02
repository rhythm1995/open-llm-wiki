/**
 * graph-health 单测 —— 孤儿 / 枢纽 / 悬空目标 派生(纯逻辑)。
 */
import { describe, expect, it } from "vitest";
import { buildGraphModel } from "./graph-model";
import {
  averageDegree,
  deadLinks,
  degreeOf,
  directedDegrees,
  isHub,
  orphanIds,
  shortestPath,
  topHubs,
} from "./graph-health";
import type { EdgeOut, NodeOut } from "./ipc";

const NODES: NodeOut[] = [
  { id: 0, path: "a.md", title: "Alpha", type: "Concept", tags: [], status: null, created: null, modified: 0, preview: "" },
  { id: 1, path: "b.md", title: "Beta", type: "Source", tags: [], status: null, created: null, modified: 0, preview: "" },
  { id: 2, path: "c.md", title: "Gamma", type: "Concept", tags: [], status: null, created: null, modified: 0, preview: "" },
  { id: 3, path: "d.md", title: "Delta", type: null, tags: [], status: null, created: null, modified: 0, preview: "" }, // 完全孤立
];
// a → b(wiki);a → c(relation);b → 悬空 Ghost;a ← (无入边给 c? c 无出边)
const EDGES: EdgeOut[] = [
  { from: 0, to: 1, kind: "wiki", relation: null, unresolved: null, anchor: null },
  { from: 0, to: 2, kind: "relation", relation: "mentions", unresolved: null, anchor: null },
  { from: 1, to: null, kind: "wiki", relation: null, unresolved: "Ghost", anchor: null },
];

const model = () => buildGraphModel(NODES, EDGES);

describe("directedDegrees / degreeOf", () => {
  it("a:out=2 in=0;b:out=0(ghost 不计)in=1;c:in=1 out=0;d:全 0", () => {
    const m = model();
    expect(degreeOf(m, 0)).toEqual({ in: 0, out: 2, total: 2 });
    expect(degreeOf(m, 1)).toEqual({ in: 1, out: 0, total: 1 });
    expect(degreeOf(m, 2)).toEqual({ in: 1, out: 0, total: 1 });
    expect(degreeOf(m, 3)).toEqual({ in: 0, out: 0, total: 0 });
  });

  it("悬空边(ghost)不计入度数", () => {
    const m = model();
    const deg = directedDegrees(m);
    // b(1) 的出边是 ghost → out=0,不是 1。
    expect(deg.get(1)!.out).toBe(0);
  });
});

describe("orphanIds", () => {
  it("both:只有完全孤立的 Delta(3)", () => {
    expect(orphanIds(model(), "both")).toEqual([3]);
  });

  it("outgoing:出度为 0 的 → b/c/d", () => {
    // a 有出度 2;其余出度 0。
    expect(orphanIds(model(), "outgoing").sort()).toEqual([1, 2, 3]);
  });

  it("incoming:入度为 0 的 → a/d", () => {
    // b、c 各有 1 入边;a、d 无入边。
    expect(orphanIds(model(), "incoming").sort()).toEqual([0, 3]);
  });

  it("默认 mode = both", () => {
    expect(orphanIds(model())).toEqual([3]);
  });

  it("按 path 稳定排序", () => {
    // outgoing 命中 b.md/c.md/d.md → id 1,2,3。
    expect(orphanIds(model(), "outgoing")).toEqual([1, 2, 3]);
  });
});

describe("topHubs", () => {
  it("按度数降序,排除 0 度,截断 limit", () => {
    const hubs = topHubs(model(), 10);
    expect(hubs.map((h) => h.id)).toEqual([0, 1, 2]); // 度 2,1,1;d(0) 排除
    expect(hubs[0]).toEqual({ id: 0, path: "a.md", title: "Alpha", degree: 2 });
  });

  it("同度按 path 升序(b.md < c.md)", () => {
    const hubs = topHubs(model(), 10);
    expect(hubs[1].id).toBe(1); // b.md
    expect(hubs[2].id).toBe(2); // c.md
  });

  it("limit 截断", () => {
    expect(topHubs(model(), 1)).toHaveLength(1);
    expect(topHubs(model(), 1)[0].id).toBe(0);
  });
});

describe("isHub / averageDegree", () => {
  it("averageDegree = (2+1+1+0)/4 = 1", () => {
    expect(averageDegree(model())).toBeCloseTo(1, 5);
  });

  it("默认阈值=均值:a(2) 是枢纽;b/c(1) >= 1 也是;d(0) 不是", () => {
    const m = model();
    expect(isHub(m, 0)).toBe(true);
    expect(isHub(m, 1)).toBe(true);
    expect(isHub(m, 3)).toBe(false);
  });

  it("自定义阈值 2:只有 a 是枢纽", () => {
    const m = model();
    expect(isHub(m, 0, 2)).toBe(true);
    expect(isHub(m, 1, 2)).toBe(false);
  });
});

describe("deadLinks", () => {
  it("收集 to=null 的边,带 from + target 文本", () => {
    const dl = deadLinks(model());
    expect(dl).toHaveLength(1);
    expect(dl[0]).toEqual({
      from: 1,
      fromPath: "b.md",
      target: "Ghost",
      kind: "wiki",
      relation: null,
    });
  });

  it("已解析边不出现", () => {
    const dl = deadLinks(model());
    expect(dl.every((d) => d.target !== "")).toBe(true);
    expect(dl.length).toBe(1);
  });
});

describe("shortestPath", () => {
  it("直连:a→b = [0,1]", () => {
    expect(shortestPath(model(), 0, 1)).toEqual([0, 1]);
  });

  it("两跳经枢纽:b→a→c = [1,0,2]", () => {
    expect(shortestPath(model(), 1, 2)).toEqual([1, 0, 2]);
  });

  it("自环:from===to → [from]", () => {
    expect(shortestPath(model(), 0, 0)).toEqual([0]);
  });

  it("不可达(孤立 d)→ null", () => {
    expect(shortestPath(model(), 0, 3)).toBeNull();
  });

  it("端点不在图里 → null", () => {
    expect(shortestPath(model(), 0, 999)).toBeNull();
  });

  it("无向:b→c 也可走(反向)", () => {
    // b(1) 只被 a 指向;无向下 b→a→c。
    expect(shortestPath(model(), 1, 2)).not.toBeNull();
  });
});
