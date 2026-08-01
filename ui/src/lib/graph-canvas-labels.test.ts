import { describe, expect, it } from "vitest";
import { planCanvasLabels } from "./graph-canvas-labels";

const baseOpts = {
  scale: 1,
  measure: (s: string) => s.length * 7,
};

describe("planCanvasLabels 基础", () => {
  it("空候选 → []", () => {
    expect(planCanvasLabels([], baseOpts)).toEqual([]);
  });
  it("注入的 measure 决定芯片宽", () => {
    const out = planCanvasLabels(
      [{ id: 1, x: 0, y: 0, title: "ab", priority: 10 }],
      { ...baseOpts, padX: 8 },
    );
    expect(out).toHaveLength(1);
    // chip 宽 = measure("ab") + 2*padX = 14 + 16 = 30。
    expect(out[0].x1 - out[0].x0).toBe(30);
  });
});

describe("planCanvasLabels 避让", () => {
  it("屏上重叠 → 仅高优先级存活", () => {
    const out = planCanvasLabels(
      [
        { id: 1, x: 0, y: 0, title: "low", priority: 1 },
        { id: 2, x: 0, y: 0, title: "high", priority: 100 },
      ],
      baseOpts,
    );
    expect(out.map((p) => p.id)).toEqual([2]);
  });
  it("maxLabels 上限", () => {
    const out = planCanvasLabels(
      [
        { id: 1, x: 0, y: 0, title: "a", priority: 30 },
        { id: 2, x: 100, y: 0, title: "b", priority: 20 },
        { id: 3, x: 200, y: 0, title: "c", priority: 10 },
      ],
      { ...baseOpts, maxLabels: 2 },
    );
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("planCanvasLabels 截断", () => {
  it("超长标题以省略号截断", () => {
    const out = planCanvasLabels(
      [{ id: 1, x: 0, y: 0, title: "x".repeat(200), priority: 10 }],
      baseOpts,
    );
    expect(out).toHaveLength(1);
    expect(out[0].text.endsWith("…")).toBe(true);
    expect(out[0].text.length).toBeLessThan(200);
  });
});

describe("planCanvasLabels 缩放间距", () => {
  it("scale 越大 → 同批节点屏距越远,能容纳更多标签", () => {
    const candidates = [
      { id: 1, x: 1, y: 0, title: "a", priority: 10 },
      { id: 2, x: 2, y: 0, title: "b", priority: 9 },
    ];
    // 小 scale:两节点屏上贴近 → 冲突,只活一个。
    const small = planCanvasLabels(candidates, { ...baseOpts, scale: 0.1 });
    // 大 scale:屏距拉开 → 都能活。
    const large = planCanvasLabels(candidates, { ...baseOpts, scale: 50 });
    expect(small.length).toBeLessThanOrEqual(large.length);
    expect(large.length).toBe(2);
  });
});

describe("planCanvasLabels 优先级推导", () => {
  it("未给 priority 时由 labelPriority(度数/状态)推导", () => {
    const out = planCanvasLabels(
      [
        { id: 1, x: 0, y: 0, title: "a", degree: 0 },
        { id: 2, x: 0, y: 0, title: "b", degree: 100, isCurrent: true },
      ],
      baseOpts,
    );
    // 度数高 + current 的 id=2 应当胜出。
    expect(out.map((p) => p.id)).toEqual([2]);
  });
});
