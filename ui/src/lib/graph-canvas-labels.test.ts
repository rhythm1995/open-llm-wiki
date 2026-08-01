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
  it("预算淘汰:maxLabels=1 → 仅最高优先级存活", () => {
    // 用 maxLabels 而非"同原点"来制造淘汰——4 锚点算法下同原点已能共存,
    // 故预算才是"高优先级挤掉低优先级"的可靠触发条件。
    const out = planCanvasLabels(
      [
        { id: 1, x: 0, y: 0, title: "low", priority: 1 },
        { id: 2, x: 0, y: 0, title: "high", priority: 100 },
      ],
      { ...baseOpts, maxLabels: 1 },
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
      { ...baseOpts, maxLabels: 1 },
    );
    // 度数高 + current 的 id=2 应当胜出(maxLabels=1 下唯一存活)。
    expect(out.map((p) => p.id)).toEqual([2]);
  });
});

describe("planCanvasLabels 4 锚点与避让节点圆", () => {
  it("4 锚点:同原点两节点可用不同锚点共存", () => {
    // 旧单锚点(仅 right)下同原点必冲突;4 锚点让第二个落到 bottom/top/left。
    const out = planCanvasLabels(
      [
        { id: 1, x: 0, y: 0, title: "a", priority: 10 },
        { id: 2, x: 0, y: 0, title: "b", priority: 9 },
      ],
      baseOpts,
    );
    expect(out).toHaveLength(2);
    expect(out[0].anchor).not.toBe(out[1].anchor);
  });
  it("避让节点圆:标签不得盖其他节点", () => {
    // 节点 2 紧贴节点 1 右侧,挡住 right 锚点;规划应换到不盖节点 2 圆的锚点。
    const out = planCanvasLabels(
      [{ id: 1, x: 0, y: 0, title: "hello", priority: 10 }],
      {
        ...baseOpts,
        nodes: [
          { id: 1, x: 0, y: 0, radius: 5 },
          { id: 2, x: 14, y: 0, radius: 5 },
        ],
      },
    );
    expect(out).toHaveLength(1);
    const p = out[0];
    const nx = Math.max(p.x0, Math.min(14, p.x1));
    const ny = Math.max(p.y0, Math.min(0, p.y1));
    expect(Math.hypot(14 - nx, 0 - ny)).toBeGreaterThanOrEqual(5);
  });
  it("离视口中心近的候选优先拿到标签", () => {
    // 三个等优先级节点,maxLabels=1 → 离中心最近者(中节点)胜出。
    const out = planCanvasLabels(
      [
        { id: 1, x: -100, y: 0, title: "far-left", priority: 5 },
        { id: 2, x: 0, y: 0, title: "center", priority: 5 },
        { id: 3, x: 100, y: 0, title: "far-right", priority: 5 },
      ],
      { ...baseOpts, maxLabels: 1, viewportCenter: { x: 0, y: 0 } },
    );
    expect(out.map((p) => p.id)).toEqual([2]);
  });
});
