import { describe, expect, it } from "vitest";
import {
  countMissingPositions,
  suggestLayoutIterations,
} from "./graph-layout-budget";

describe("suggestLayoutIterations", () => {
  it("无结构变化时迭代很少", () => {
    expect(
      suggestLayoutIterations({
        n: 100,
        newNodeCount: 0,
        structureChanged: false,
      }),
    ).toBeLessThan(40);
  });

  it("少量新节点少于全量重建", () => {
    const warm = suggestLayoutIterations({
      n: 200,
      newNodeCount: 2,
      structureChanged: true,
    });
    const cold = suggestLayoutIterations({
      n: 200,
      newNodeCount: 50,
      structureChanged: true,
    });
    expect(warm).toBeLessThan(cold);
  });

  it("大图上限封顶", () => {
    expect(
      suggestLayoutIterations({
        n: 2000,
        newNodeCount: 100,
        structureChanged: true,
      }),
    ).toBeLessThanOrEqual(60);
  });
});

describe("countMissingPositions", () => {
  it("计数无位置 id", () => {
    const pos = new Map([[1, { x: 0, y: 0 }]]);
    expect(countMissingPositions([1, 2, 3], pos)).toBe(2);
  });
});
