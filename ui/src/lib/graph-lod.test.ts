import { describe, expect, it } from "vitest";
import {
  applyLod,
  buildLodRenderKeyMap,
  clusterByGrid,
  clusterRadius,
  projectLodEdges,
  shouldUseLod,
} from "./graph-lod";
import type { Pt } from "./graph-layout";

function posMap(entries: [number, Pt][]): Map<number, Pt> {
  return new Map(entries);
}

describe("shouldUseLod", () => {
  it("节点少或缩放大时关闭", () => {
    expect(shouldUseLod(100, 0.2)).toBe(false);
    expect(shouldUseLod(500, 1.0)).toBe(false);
  });
  it("节点多且缩小时开启", () => {
    expect(shouldUseLod(500, 0.3)).toBe(true);
  });
});

describe("clusterByGrid", () => {
  it("同格合并、不同格分开", () => {
    const pos = posMap([
      [1, { x: 10, y: 10 }],
      [2, { x: 12, y: 11 }],
      [3, { x: 200, y: 200 }],
    ]);
    const clusters = clusterByGrid([1, 2, 3], pos, 50);
    expect(clusters).toHaveLength(2);
    const big = clusters.find((c) => c.size === 2)!;
    expect(big.memberIds.sort()).toEqual([1, 2]);
    expect(big.x).toBeCloseTo(11, 5);
  });
});

describe("applyLod", () => {
  it("不满足条件时 leaf 全量", () => {
    const pos = posMap([[1, { x: 0, y: 0 }]]);
    const r = applyLod([1], pos, 1);
    expect(r.active).toBe(false);
    expect(r.leafIds).toEqual([1]);
  });

  it("满足时产出多成员簇并 flatten 单点", () => {
    const ids: number[] = [];
    const pos = new Map<number, Pt>();
    // 400+ 节点挤在两格
    for (let i = 0; i < 250; i++) {
      ids.push(i);
      pos.set(i, { x: i % 2, y: 0 });
    }
    for (let i = 250; i < 500; i++) {
      ids.push(i);
      pos.set(i, { x: 1000 + (i % 2), y: 1000 });
    }
    const r = applyLod(ids, pos, 0.3, { minNodes: 400, maxScale: 0.55, cellSize: 50 });
    expect(r.active).toBe(true);
    expect(r.clusters.length).toBeGreaterThanOrEqual(1);
    const totalMembers =
      r.clusters.reduce((s, c) => s + c.size, 0) + r.leafIds.length;
    expect(totalMembers).toBe(500);
  });
});

describe("clusterRadius", () => {
  it("随 size 增长且有上界", () => {
    expect(clusterRadius(1)).toBeLessThan(clusterRadius(100));
    expect(clusterRadius(10_000)).toBe(28);
  });
});

describe("projectLodEdges", () => {
  it("簇内边丢弃、簇间边合并 weight", () => {
    const keyMap = new Map([
      [1, "c:0,0"],
      [2, "c:0,0"],
      [3, "c:1,0"],
      [4, "4"],
    ]);
    const edges = projectLodEdges(
      [
        { from: 1, to: 2, kind: "wiki" },
        { from: 1, to: 3, kind: "wiki" },
        { from: 2, to: 3, kind: "wiki" },
        { from: 3, to: 4, kind: "relation" },
        { from: 1, to: null, kind: "wiki" },
      ],
      keyMap,
    );
    expect(edges.find((e) => e.source === "c:0,0" && e.target === "c:1,0")?.weight).toBe(
      2,
    );
    // 无向规范化:lex 小的为 source("4" < "c:1,0")。
    const rel = edges.find((e) => e.kind === "relation")!;
    expect([rel.source, rel.target].sort()).toEqual(["4", "c:1,0"]);
    // 簇内 1-2 不应出现。
    expect(edges.every((e) => e.source !== e.target)).toBe(true);
  });
});

describe("buildLodRenderKeyMap", () => {
  it("叶子与簇成员映射", () => {
    const m = buildLodRenderKeyMap({
      active: true,
      leafIds: [9],
      clusters: [{ key: "0,0", memberIds: [1, 2], x: 0, y: 0, size: 2 }],
    });
    expect(m.get(9)).toBe("9");
    expect(m.get(1)).toBe("c:0,0");
    expect(m.get(2)).toBe("c:0,0");
  });
});
