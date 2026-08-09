import { describe, expect, it } from "vitest";
import {
  colorWithAlpha,
  isDarkTheme,
  nodeRingStyle,
  nodeSizeFromDegree,
  nodeVisualState,
} from "./graph-style";

describe("colorWithAlpha", () => {
  it("6 位 hex → rgba", () => {
    expect(colorWithAlpha("#1e66f5", 0.5)).toBe("rgba(30,102,245,0.5)");
  });
  it("3 位 hex 展开后叠透明度", () => {
    expect(colorWithAlpha("#fff", 0.2)).toBe("rgba(255,255,255,0.2)");
    expect(colorWithAlpha("#0a9", 1)).toBe("rgba(0,170,153,1)");
  });
  it("透明度夹到 [0,1]", () => {
    expect(colorWithAlpha("#1e66f5", -1)).toBe("rgba(30,102,245,0)");
    expect(colorWithAlpha("#1e66f5", 2)).toBe("rgba(30,102,245,1)");
  });
  it("rgba 输入保留 rgb 并改透明度", () => {
    expect(colorWithAlpha("rgba(30,102,245,0.8)", 0.5)).toBe(
      "rgba(30,102,245,0.5)",
    );
  });
  it("非 hex/rgba 原样透传", () => {
    expect(colorWithAlpha("red", 0.5)).toBe("red");
  });
});

describe("nodeSizeFromDegree", () => {
  it("度数 0 → 3.2,单调递增", () => {
    expect(nodeSizeFromDegree(0)).toBe(3.2);
    expect(nodeSizeFromDegree(0)).toBeLessThan(nodeSizeFromDegree(16));
    expect(nodeSizeFromDegree(16)).toBeLessThan(nodeSizeFromDegree(64));
  });
  it("负度数当 0 处理,绝不返回负数", () => {
    expect(nodeSizeFromDegree(-5)).toBe(3.2);
  });
  it("亚线性增长(平方根):度数增幅 > 尺寸增幅", () => {
    const s4 = nodeSizeFromDegree(4);
    const s16 = nodeSizeFromDegree(16);
    const incRatio = (s16 - 3.2) / (s4 - 3.2);
    expect(incRatio).toBeLessThan(16 / 4);
  });
});

describe("nodeVisualState", () => {
  it("优先级 active > missing > selected > external > normal", () => {
    expect(nodeVisualState({ isCurrent: true, isMissing: true })).toBe("active");
    expect(nodeVisualState({ isMissing: true, isSelected: true })).toBe("missing");
    expect(nodeVisualState({ isSelected: true, isGhost: true })).toBe("selected");
    expect(nodeVisualState({ isGhost: true })).toBe("external");
    expect(nodeVisualState({})).toBe("normal");
  });
});

describe("isDarkTheme", () => {
  it("深底 → true,浅底 → false", () => {
    const set = (v: string) =>
      document.documentElement.style.setProperty("--color-base", v);
    const restore = document.documentElement.style.getPropertyValue(
      "--color-base",
    );
    try {
      set("#1e1e2e");
      expect(isDarkTheme()).toBe(true);
      set("#eff1f5");
      expect(isDarkTheme()).toBe(false);
    } finally {
      if (restore) {
        document.documentElement.style.setProperty("--color-base", restore);
      } else {
        document.documentElement.style.removeProperty("--color-base");
      }
    }
  });
});

describe("nodeRingStyle", () => {
  it("missing 为红色虚线环", () => {
    const r = nodeRingStyle("missing");
    expect(r.dashed).toBe(true);
    expect(r.ringWidth).toBeGreaterThan(0);
  });
  it("normal 不画环", () => {
    expect(nodeRingStyle("normal").ringWidth).toBe(0);
  });
  it("active 为实线环", () => {
    expect(nodeRingStyle("active").dashed).toBe(false);
    expect(nodeRingStyle("active").ringWidth).toBeGreaterThan(0);
  });
});
