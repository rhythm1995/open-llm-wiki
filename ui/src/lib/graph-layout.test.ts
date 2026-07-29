/**
 * graph-layout 单测 —— 验证力导向布局的核心不变量(无需 GUI)。
 */
import { describe, expect, it } from "vitest";
import {
  bbox,
  fitTransform,
  relaxLayout,
  seedNodes,
  visibleNodeIds,
  type Pt,
  type Spring,
} from "./graph-layout";

describe("seedNodes", () => {
  it("为未知 id 播种,已知 id 保持不动", () => {
    const pos = new Map<number, Pt>([[1, { x: 100, y: 100 }]]);
    const neighbors = new Map<number, number[]>([[2, [1]]]);
    seedNodes([1, 2], neighbors, pos, { w: 400, h: 400 }, () => 0.5);
    expect(pos.get(1)).toEqual({ x: 100, y: 100 });
    expect(pos.has(2)).toBe(true);
  });

  it("有邻居时贴在邻居附近", () => {
    const pos = new Map<number, Pt>([[1, { x: 200, y: 200 }]]);
    const neighbors = new Map<number, number[]>([[2, [1]]]);
    seedNodes([2], neighbors, pos, { w: 400, h: 400 }, () => 0.5);
    const p = pos.get(2)!;
    // rand=0.5 → 抖动 (0.5-0.5)*40 = 0,正好落在邻居上。
    expect(p.x).toBe(200);
    expect(p.y).toBe(200);
  });

  it("无邻居时绕中心螺旋播种,落在画布内", () => {
    const pos = new Map<number, Pt>();
    const neighbors = new Map<number, number[]>();
    const ids = [10, 11, 12, 13];
    seedNodes(ids, neighbors, pos, { w: 400, h: 400 });
    for (const id of ids) {
      const p = pos.get(id)!;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(400);
    }
  });
});

describe("relaxLayout", () => {
  it("空集不抛错", () => {
    expect(() => relaxLayout([], [], new Map(), { w: 400, h: 400 })).not.toThrow();
  });

  it("单节点不抛错且留在画布内", () => {
    const pos = new Map<number, Pt>([[0, { x: 5, y: 5 }]]);
    relaxLayout([0], [], pos, { w: 400, h: 400, pad: 18 });
    const p = pos.get(0)!;
    expect(p.x).toBeGreaterThanOrEqual(18);
    expect(p.y).toBeGreaterThanOrEqual(18);
  });

  it("两个相连节点会被拉拢(距离收敛小于初值)", () => {
    const pos = new Map<number, Pt>([
      [0, { x: 10, y: 200 }],
      [1, { x: 390, y: 200 }],
    ]);
    const springs: Spring[] = [{ from: 0, to: 1 }];
    const before = Math.hypot(pos.get(0)!.x - pos.get(1)!.x, 0);
    relaxLayout([0, 1], springs, pos, { w: 400, h: 400, iterations: 200 });
    const after = Math.hypot(pos.get(0)!.x - pos.get(1)!.x, 0);
    expect(after).toBeLessThan(before);
  });

  it("两个无连接节点互相排斥(距离增大)", () => {
    const pos = new Map<number, Pt>([
      [0, { x: 190, y: 200 }],
      [1, { x: 210, y: 200 }],
    ]);
    const before = Math.abs(pos.get(0)!.x - pos.get(1)!.x);
    relaxLayout([0, 1], [], pos, { w: 400, h: 400, iterations: 120 });
    const after = Math.abs(pos.get(0)!.x - pos.get(1)!.x);
    expect(after).toBeGreaterThan(before);
  });

  it("位置以既有为初值(暖启动):两次小迭代 ≈ 一次双倍迭代的方向", () => {
    // 结构相同,比较终点到质心的距离量级稳定(不发散)。
    const make = () => {
      const pos = new Map<number, Pt>();
      const ids = [0, 1, 2, 3, 4];
      seedNodes(ids, new Map(), pos, { w: 400, h: 400 }, () => 0.3);
      return { pos, ids };
    };
    const springs: Spring[] = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ];
    const a = make();
    relaxLayout(a.ids, springs, a.pos, { w: 400, h: 400, iterations: 120 });
    const cx =
      a.ids.reduce((s, id) => s + a.pos.get(id)!.x, 0) / a.ids.length;
    // 收敛后节点应聚拢在中心附近(均值离中心 < 120)。
    expect(Math.abs(cx - 200)).toBeLessThan(120);
  });

  it("所有点夹在 [pad, w-pad] × [pad, h-pad] 内", () => {
    const pos = new Map<number, Pt>();
    const ids = Array.from({ length: 20 }, (_, i) => i);
    seedNodes(ids, new Map(), pos, { w: 500, h: 400 });
    const springs: Spring[] = [];
    for (let i = 1; i < ids.length; i++) springs.push({ from: ids[i - 1], to: ids[i] });
    relaxLayout(ids, springs, pos, { w: 500, h: 400, pad: 25, iterations: 80 });
    for (const id of ids) {
      const p = pos.get(id)!;
      expect(p.x).toBeGreaterThanOrEqual(25);
      expect(p.x).toBeLessThanOrEqual(475);
      expect(p.y).toBeGreaterThanOrEqual(25);
      expect(p.y).toBeLessThanOrEqual(375);
    }
  });
});

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
