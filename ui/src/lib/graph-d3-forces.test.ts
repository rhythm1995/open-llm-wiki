import { describe, expect, it } from "vitest";
import { d3ForceParams } from "./graph-d3-forces";
import type { ForceParams } from "./graph-layout";

const DEF: ForceParams = { center: 1, repel: 1, linkStrength: 1, linkDistance: 1 };

describe("d3ForceParams 默认值", () => {
  it("默认全 1 → 有限、符号正确、范围合理", () => {
    const c = d3ForceParams(DEF, { w: 1000, h: 800, nodeCount: 100 });
    expect(Number.isFinite(c.chargeStrength)).toBe(true);
    expect(c.chargeStrength).toBeLessThan(0);
    expect(c.linkStrength).toBeGreaterThan(0);
    expect(c.linkStrength).toBeLessThanOrEqual(1);
    expect(c.linkDistance).toBeGreaterThan(0);
    expect(c.xStrength).toBe(c.yStrength);
    expect(c.xStrength).toBeGreaterThan(0);
  });
});

describe("d3ForceParams 边界/夹取", () => {
  it("repel=0 → 无斥力(|chargeStrength| === 0)", () => {
    const c = d3ForceParams({ ...DEF, repel: 0 }, { w: 1000, h: 800, nodeCount: 10 });
    expect(Math.abs(c.chargeStrength)).toBe(0);
  });
  it("linkDistance=0 → 弹簧距离有下限(不坍缩)", () => {
    const c = d3ForceParams({ ...DEF, linkDistance: 0 }, { w: 1000, h: 800, nodeCount: 10 });
    expect(c.linkDistance).toBeGreaterThan(0);
  });
  it("超过上限被夹取", () => {
    const c = d3ForceParams(
      { center: 100, repel: 100, linkStrength: 100, linkDistance: 100 },
      { w: 1000, h: 800, nodeCount: 10 },
    );
    // chargeStrength 最低 -4000。
    expect(c.chargeStrength).toBeGreaterThanOrEqual(-4000);
    expect(c.linkStrength).toBeLessThanOrEqual(1);
    // 100 → 夹 50 → 50*36 = 1800。
    expect(c.linkDistance).toBe(50 * 36);
  });
  it("NaN 当默认 1 处理", () => {
    const c = d3ForceParams(
      { center: NaN, repel: NaN, linkStrength: NaN, linkDistance: NaN },
      { w: 1000, h: 800, nodeCount: 10 },
    );
    const base = d3ForceParams(DEF, { w: 1000, h: 800, nodeCount: 10 });
    expect(c).toEqual(base);
  });
});

describe("d3ForceParams 单调性", () => {
  it("repel 越大 → chargeStrength 越负(夹取前)", () => {
    const a = d3ForceParams({ ...DEF, repel: 1 }, { w: 1000, h: 1000, nodeCount: 10 });
    const b = d3ForceParams({ ...DEF, repel: 10 }, { w: 1000, h: 1000, nodeCount: 10 });
    expect(b.chargeStrength).toBeLessThan(a.chargeStrength);
  });
  it("linkDistance 越大 → linkDistance 越大", () => {
    const a = d3ForceParams({ ...DEF, linkDistance: 1 }, { w: 1000, h: 1000, nodeCount: 10 });
    const b = d3ForceParams({ ...DEF, linkDistance: 5 }, { w: 1000, h: 1000, nodeCount: 10 });
    expect(b.linkDistance).toBeGreaterThan(a.linkDistance);
  });
  it("center 越大 → xStrength 越大", () => {
    const a = d3ForceParams({ ...DEF, center: 1 }, { w: 1000, h: 1000, nodeCount: 10 });
    const b = d3ForceParams({ ...DEF, center: 5 }, { w: 1000, h: 1000, nodeCount: 10 });
    expect(b.xStrength).toBeGreaterThan(a.xStrength);
  });
});

describe("d3ForceParams 密度缩放", () => {
  it("节点越多 → 单节点斥力越弱(|charge| 越小)", () => {
    const sparse = d3ForceParams(DEF, { w: 1000, h: 1000, nodeCount: 10 });
    const dense = d3ForceParams(DEF, { w: 1000, h: 1000, nodeCount: 1000 });
    expect(Math.abs(dense.chargeStrength)).toBeLessThan(
      Math.abs(sparse.chargeStrength),
    );
  });
});
