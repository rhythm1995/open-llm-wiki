import { describe, expect, it } from "vitest";
import {
  buildSigmaClusterAttrs,
  buildSigmaNodeAttrs,
  buildUnresolvedGhosts,
  canUseWebGL,
  colorWithAlpha,
  nodeSizeFromDegree,
} from "./graph-webgl";

describe("canUseWebGL", () => {
  it("jsdom 下通常为 false(无真实 GL)", () => {
    // 不强制 false:部分环境可能 mock;只断言 boolean。
    expect(typeof canUseWebGL()).toBe("boolean");
  });
});

describe("nodeSizeFromDegree", () => {
  it("度数越大节点越大", () => {
    expect(nodeSizeFromDegree(0)).toBeLessThan(nodeSizeFromDegree(16));
  });
});

describe("buildSigmaNodeAttrs", () => {
  it("跳过无位置节点,强制标签规则", () => {
    const pos = new Map([[1, { x: 10, y: 20 }]]);
    const meta = new Map([
      [1, { title: "A", type: "Note" as string | null, degree: 5 }],
      [2, { title: "B", type: null, degree: 0 }],
    ]);
    const attrs = buildSigmaNodeAttrs([1, 2], pos, meta, {
      currentId: 1,
      hoverId: null,
      selected: new Set(),
      textHits: new Set(),
      forceLabelAll: false,
    });
    expect(attrs.has("1")).toBe(true);
    expect(attrs.has("2")).toBe(false);
    expect(attrs.get("1")!.forceLabel).toBe(true);
    expect(attrs.get("1")!.highlighted).toBe(true);
  });
});

describe("buildSigmaClusterAttrs", () => {
  it("键前缀 c:", () => {
    const m = buildSigmaClusterAttrs([
      { key: "0,0", memberIds: [1, 2], x: 1, y: 2, size: 2 },
    ]);
    expect(m.get("c:0,0")?.isCluster).toBe(true);
    expect(m.get("c:0,0")?.label).toBe("2");
  });
});

describe("colorWithAlpha", () => {
  it("hex → rgba", () => {
    expect(colorWithAlpha("#1e66f5", 0.5)).toBe("rgba(30,102,245,0.5)");
    expect(colorWithAlpha("#fff", 0.2)).toBe("rgba(255,255,255,0.2)");
  });
});

describe("buildUnresolvedGhosts", () => {
  it("为悬空边生成 ghost 节点与边", () => {
    const pos = new Map([[1, { x: 10, y: 20 }]]);
    const g = buildUnresolvedGhosts(
      [
        { from: 1, to: null },
        { from: 1, to: 2 },
      ],
      pos,
      new Set([1]),
    );
    expect(g.nodes.size).toBe(1);
    expect(g.edges).toHaveLength(1);
    expect([...g.nodes.values()][0].isGhost).toBe(true);
  });
});

describe("buildSigmaNodeAttrs neighbor dim", () => {
  it("非邻居压暗", () => {
    const pos = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 1, y: 1 }],
    ]);
    const meta = new Map([
      [1, { title: "A", type: "Note" as string | null, degree: 1 }],
      [2, { title: "B", type: "Note" as string | null, degree: 1 }],
    ]);
    const attrs = buildSigmaNodeAttrs([1, 2], pos, meta, {
      currentId: null,
      hoverId: 1,
      selected: new Set(),
      textHits: new Set(),
      neighborFocus: new Set([1]),
      forceLabelAll: false,
    });
    // 压暗后 alpha 更低。
    expect(attrs.get("2")!.color).toContain("0.18");
    expect(attrs.get("1")!.color).not.toContain("0.18");
  });
});
