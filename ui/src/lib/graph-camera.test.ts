import { describe, expect, it } from "vitest";
import {
  bboxesIntersect,
  clampCameraToContent,
  contentBBox,
  expandBBox,
  isViewportEmpty,
  minZoomToFit,
  viewportBBox,
} from "./graph-camera";

describe("contentBBox", () => {
  it("空 / 全 missing → null", () => {
    expect(contentBBox([])).toBeNull();
    expect(contentBBox([{ x: 1, y: 1, isMissing: true }])).toBeNull();
    expect(contentBBox([{ x: 0, y: 0 }])).toBeNull();
  });
  it("含半径扩张", () => {
    const b = contentBBox([
      { x: 0, y: 10, r: 5 },
      { x: 100, y: 10, r: 5 },
    ]);
    // 0,0 被跳过规则: x=0 y=10 不是 (0,0)
    expect(b).not.toBeNull();
    expect(b!.minX).toBeLessThanOrEqual(-5);
    expect(b!.maxX).toBeGreaterThanOrEqual(105);
  });
});

describe("clampCameraToContent", () => {
  const content = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
  it("中心在内则几乎不动", () => {
    const c = clampCameraToContent(
      { x: 100, y: 50, k: 2 },
      content,
      400,
      300,
    );
    expect(c.x).toBe(100);
    expect(c.y).toBe(50);
  });
  it("拖飞后拉回扩张区", () => {
    const c = clampCameraToContent(
      { x: 9999, y: 9999, k: 2 },
      content,
      400,
      300,
    );
    expect(c.x).toBeLessThan(500);
    expect(c.y).toBeLessThan(500);
    expect(isViewportEmpty(c, content, 400, 300)).toBe(false);
  });
});

describe("isViewportEmpty", () => {
  const content = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  it("对准内容 → 非空", () => {
    expect(
      isViewportEmpty({ x: 50, y: 50, k: 1 }, content, 200, 200),
    ).toBe(false);
  });
  it("中心远离 → 空", () => {
    expect(
      isViewportEmpty({ x: 5000, y: 5000, k: 1 }, content, 200, 200),
    ).toBe(true);
  });
});

describe("helpers", () => {
  it("expand / intersect / minZoom", () => {
    const b = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const e = expandBBox(b, 0.5, 5);
    expect(e.minX).toBeLessThan(0);
    expect(bboxesIntersect(b, e)).toBe(true);
    expect(minZoomToFit(b, 200, 200, 20)).toBeGreaterThan(0);
    const v = viewportBBox({ x: 0, y: 0, k: 1 }, 100, 100);
    expect(v.maxX - v.minX).toBe(100);
  });
});
