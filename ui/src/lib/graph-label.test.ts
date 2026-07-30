import { describe, expect, it } from "vitest";
import { labelPriority, pickVisibleLabels } from "./graph-label";

describe("labelPriority", () => {
  it("焦点/当前高于高度数", () => {
    expect(
      labelPriority({ degree: 100, isCurrent: true }),
    ).toBeGreaterThan(labelPriority({ degree: 100 }));
    expect(
      labelPriority({ degree: 0, isHover: true }),
    ).toBeGreaterThan(labelPriority({ degree: 50 }));
  });
});

describe("pickVisibleLabels", () => {
  it("重叠时只保留高优先级", () => {
    // 同位置两个标签,scale=1 完全重叠。
    const ids = pickVisibleLabels(
      [
        { id: 1, x: 100, y: 100, priority: 10, title: "low", widthPx: 80 },
        { id: 2, x: 100, y: 100, priority: 100, title: "high", widthPx: 80 },
      ],
      { scale: 1, tx: 0, ty: 0 },
    );
    expect(ids.has(2)).toBe(true);
    expect(ids.has(1)).toBe(false);
  });

  it("足够远时都显示", () => {
    const ids = pickVisibleLabels(
      [
        { id: 1, x: 0, y: 0, priority: 1, title: "a", widthPx: 40 },
        { id: 2, x: 200, y: 0, priority: 1, title: "b", widthPx: 40 },
      ],
      { scale: 1, tx: 0, ty: 0 },
    );
    expect(ids.size).toBe(2);
  });

  it("maxLabels 截断", () => {
    const cands = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      x: i * 100,
      y: 0,
      priority: i,
      title: `n${i}`,
      widthPx: 30,
    }));
    const ids = pickVisibleLabels(cands, {
      scale: 1,
      tx: 0,
      ty: 0,
      maxLabels: 3,
    });
    expect(ids.size).toBe(3);
    // 最高 priority 的三个:7,8,9
    expect(ids.has(9)).toBe(true);
    expect(ids.has(8)).toBe(true);
    expect(ids.has(7)).toBe(true);
  });
});
