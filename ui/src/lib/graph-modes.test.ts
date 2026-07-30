import { describe, expect, it } from "vitest";
import type { Pt } from "./graph-layout";
import {
  layoutByTimeline,
  layoutByTypeLayer,
  resolveNodeTimeMs,
  TYPELESS_LABEL,
} from "./graph-modes";

describe("layoutByTypeLayer", () => {
  it("不同 type 落在不同 y 带", () => {
    const pos = new Map<number, Pt>();
    const typeOf = (id: number) =>
      id <= 2 ? "Concept" : id === 3 ? null : "Note";
    layoutByTypeLayer([1, 2, 3, 4], typeOf, pos, {
      w: 400,
      h: 300,
      typeOrder: ["Concept", "Note", TYPELESS_LABEL],
    });
    expect(pos.size).toBe(4);
    const yC = pos.get(1)!.y;
    const yN = pos.get(4)!.y;
    const yU = pos.get(3)!.y;
    expect(yC).not.toBe(yN);
    expect(yN).not.toBe(yU);
    // 同 type 共享 y
    expect(pos.get(2)!.y).toBe(yC);
  });
});

describe("layoutByTimeline", () => {
  it("更早时间更靠左;未知在右侧", () => {
    const pos = new Map<number, Pt>();
    const t = (id: number) => {
      if (id === 1) return 1000;
      if (id === 2) return 9000;
      return null;
    };
    layoutByTimeline([1, 2, 3], t, pos, { w: 500, h: 200 });
    expect(pos.get(1)!.x).toBeLessThan(pos.get(2)!.x);
    expect(pos.get(3)!.x).toBeGreaterThan(pos.get(2)!.x);
  });
});

describe("resolveNodeTimeMs", () => {
  it("优先 created 字符串", () => {
    const ms = resolveNodeTimeMs({
      created: "2024-01-15",
      modified: 1,
    });
    expect(ms).toBeGreaterThan(0);
  });
  it("回退 modified", () => {
    expect(
      resolveNodeTimeMs({ created: null, modified: 42 }),
    ).toBe(42);
  });
  it("皆无 → null", () => {
    expect(resolveNodeTimeMs({ created: "", modified: 0 })).toBeNull();
  });
});
