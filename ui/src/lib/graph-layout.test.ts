/**
 * graph-layout 单测 —— 验证保留的纯逻辑工具(无需 GUI)。
 *
 * 力导向由 Cytoscape cose 负责;本文件覆盖 bbox / fitTransform /
 * visibleNodeIds / normalizeForces。
 */
import { describe, expect, it } from "vitest";
import {
  bbox,
  DEFAULT_FORCES,
  fitTransform,
  normalizeForces,
  visibleNodeIds,
  type Pt,
} from "./graph-layout";

describe("bbox", () => {
  it("空集返回 null", () => {
    expect(bbox([], new Map())).toBeNull();
  });

  it("返回正确包围盒", () => {
    const pos = new Map<number, Pt>([
      [0, { x: 10, y: 20 }],
      [1, { x: 80, y: 5 }],
      [2, { x: 50, y: 70 }],
    ]);
    expect(bbox([0, 1, 2], pos)).toEqual([10, 5, 80, 70]);
  });
});

describe("fitTransform", () => {
  it("null 包围盒回退单位变换", () => {
    expect(fitTransform(null, 800, 600, 40, 0.2, 4)).toEqual({ tx: 0, ty: 0, scale: 1 });
  });

  it("把包围盒居中并填满画布(带留白)", () => {
    const box: [number, number, number, number] = [0, 0, 400, 300]; // 4:3
    const w = 800;
    const h = 600;
    const pad = 40;
    const tf = fitTransform(box, w, h, pad, 0.2, 4);
    // 等比:以宽边 fit。可用宽 = 800-80=720 / 400 = 1.8;高边 600-80=520/300≈1.733 → 取小 1.733。
    expect(tf.scale).toBeCloseTo(520 / 300, 5);
    // bbox 中心 (200,150) 映射到画布中心 (400,300):tx = 400 - 200*scale, ty = 300 - 150*scale。
    expect(tf.tx).toBeCloseTo(400 - 200 * tf.scale, 5);
    expect(tf.ty).toBeCloseTo(300 - 150 * tf.scale, 5);
  });

  it("scale 被 clamp 到上限(极小 bbox 不至于过度放大)", () => {
    const box: [number, number, number, number] = [0, 0, 2, 2];
    const tf = fitTransform(box, 800, 600, 40, 0.2, 4);
    expect(tf.scale).toBe(4);
  });

  it("scale 被 clamp 到下限(超大 bbox 不至于过度缩小)", () => {
    const box: [number, number, number, number] = [0, 0, 10000, 10000];
    const tf = fitTransform(box, 800, 600, 40, 0.2, 4);
    expect(tf.scale).toBe(0.2);
  });
});

describe("visibleNodeIds", () => {
  const pos = new Map<number, Pt>([
    [0, { x: 50, y: 50 }], // 屏幕中央(单位变换)
    [1, { x: -50, y: 50 }], // 屏幕左外
    [2, { x: 50, y: -50 }], // 屏幕上外
    [3, { x: 5000, y: 5000 }], // 远屏外
  ]);
  const vp = { w: 400, h: 300 };

  it("单位变换下只返回落在画布内的节点", () => {
    const v = visibleNodeIds([0, 1, 2, 3], pos, { tx: 0, ty: 0, scale: 1 }, vp, 0);
    expect(v.has(0)).toBe(true);
    expect(v.has(1)).toBe(false);
    expect(v.has(2)).toBe(false);
    expect(v.has(3)).toBe(false);
  });

  it("margin 把近边缘的屏外节点也纳入(减少 pop-in)", () => {
    // 节点 1 在 (−50,50):margin≥50 时纳入。
    const v = visibleNodeIds([1], pos, { tx: 0, ty: 0, scale: 1 }, vp, 60);
    expect(v.has(1)).toBe(true);
    const v2 = visibleNodeIds([1], pos, { tx: 0, ty: 0, scale: 1 }, vp, 40);
    expect(v2.has(1)).toBe(false);
  });

  it("平移变换把原屏外节点移入视口", () => {
    // tx=100 把节点 1 从 −50 移到 50(入画)。
    const v = visibleNodeIds([1], pos, { tx: 100, ty: 0, scale: 1 }, vp, 0);
    expect(v.has(1)).toBe(true);
  });

  it("缩放把远点拉回视口", () => {
    // 节点 3 (5000,5000):scale=0.05 → 250,250(入 400×300 画)。
    const v = visibleNodeIds([3], pos, { tx: 0, ty: 0, scale: 0.05 }, vp, 0);
    expect(v.has(3)).toBe(true);
  });

  it("空 id 集合返回空集", () => {
    expect(visibleNodeIds([], pos, { tx: 0, ty: 0, scale: 1 }, vp, 0).size).toBe(0);
  });

  it("位置缺失的节点不计入", () => {
    const v = visibleNodeIds([0, 99], pos, { tx: 0, ty: 0, scale: 1 }, vp, 0);
    expect(v.has(0)).toBe(true);
    expect(v.has(99)).toBe(false);
  });
});

describe("normalizeForces", () => {
  it("缺省/空 → 全 1 基线", () => {
    expect(normalizeForces()).toEqual(DEFAULT_FORCES);
    expect(normalizeForces({})).toEqual(DEFAULT_FORCES);
  });

  it("合并部分字段,其余回退 1", () => {
    expect(normalizeForces({ repel: 3 })).toEqual({
      center: 1,
      repel: 3,
      linkStrength: 1,
      linkDistance: 1,
    });
  });

  it("linkDistance 下限 0.1(避免除零),其余夹 [0,50]", () => {
    expect(normalizeForces({ linkDistance: 0 }).linkDistance).toBe(0.1);
    expect(normalizeForces({ center: 999 }).center).toBe(50);
    expect(normalizeForces({ repel: -5 }).repel).toBe(0);
  });

  it("NaN/非数 回退 1", () => {
    expect(normalizeForces({ center: NaN }).center).toBe(1);
    expect(normalizeForces({ linkStrength: "x" as unknown as number }).linkStrength).toBe(1);
  });
});
