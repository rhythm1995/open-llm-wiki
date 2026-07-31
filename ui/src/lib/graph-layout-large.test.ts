/**
 * 大图布局冒烟:生成器造 vault 的规模下,relaxLayout 能在合理时间内完成。
 * 不测帧率(GUI 真机 B-GRAPH-FPS);只防布局算法在 1k 节点上挂死/超时。
 */
import { describe, expect, it } from "vitest";
import {
  BARNES_HUT_THRESHOLD,
  relaxLayout,
  seedNodes,
  type Pt,
  type Spring,
} from "./graph-layout";

function buildSynthetic(n: number): {
  ids: number[];
  neighbors: Map<number, number[]>;
  springs: Spring[];
} {
  const ids = Array.from({ length: n }, (_, i) => i);
  const neighbors = new Map<number, number[]>();
  const springs: Spring[] = [];
  for (let i = 0; i < n; i++) {
    const ns: number[] = [];
    // 环 + 少量 hub 边
    const next = (i + 1) % n;
    ns.push(next);
    springs.push({ from: i, to: next });
    if (i > 0 && i % 17 === 0) {
      ns.push(0);
      springs.push({ from: i, to: 0 });
    }
    neighbors.set(i, ns);
  }
  return { ids, neighbors, springs };
}

describe("relaxLayout large N smoke", () => {
  it("1000 节点用 Barnes-Hut 可在 3s 内完成暖启动迭代", () => {
    const n = 1000;
    expect(n).toBeGreaterThan(BARNES_HUT_THRESHOLD);
    const { ids, neighbors, springs } = buildSynthetic(n);
    const pos = new Map<number, Pt>();
    let s = 1;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    seedNodes(ids, neighbors, pos, { w: 1200, h: 800 }, rand);
    const t0 = performance.now();
    relaxLayout(ids, springs, pos, {
      w: 1200,
      h: 800,
      iterations: 40,
      repulsion: "barnes-hut",
    });
    const ms = performance.now() - t0;
    expect(pos.size).toBe(n);
    // CI 机器差异大;3s 宽松上限,主要防无限循环
    expect(ms).toBeLessThan(3000);
  });

  it("100 节点 exact 斥力可完成", () => {
    const { ids, neighbors, springs } = buildSynthetic(100);
    const pos = new Map<number, Pt>();
    seedNodes(ids, neighbors, pos, { w: 800, h: 600 }, () => 0.5);
    relaxLayout(ids, springs, pos, {
      w: 800,
      h: 600,
      iterations: 30,
      repulsion: "exact",
    });
    expect(pos.size).toBe(100);
  });
});
