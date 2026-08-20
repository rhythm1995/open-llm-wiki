/**
 * ColResizeHandle —— 拖拽方向 + min/max 夹紧;松手卸监听。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ColResizeHandle,
  clampColWidth,
  colWidthFromDrag,
  COL,
} from "./ColResizeHandle";

describe("clampColWidth", () => {
  it("低于 min 抬到 min", () => {
    expect(clampColWidth(10, 100, 400)).toBe(100);
  });

  it("高于 max 压到 max", () => {
    expect(clampColWidth(999, 100, 400)).toBe(400);
  });

  it("无 max 时不设上限", () => {
    expect(clampColWidth(8000, 100)).toBe(8000);
  });
});

describe("colWidthFromDrag", () => {
  it("side=right 向右拖变宽", () => {
    expect(colWidthFromDrag(200, 100, 140, "right", 100, 400)).toBe(240);
  });

  it("side=left 向左拖变宽", () => {
    expect(colWidthFromDrag(200, 100, 60, "left", 100, 400)).toBe(240);
  });

  it("位移经 round 再夹紧", () => {
    expect(colWidthFromDrag(200, 0, 0.4, "right", 100, 400)).toBe(200);
    expect(colWidthFromDrag(200, 0, 250, "right", 100, 220)).toBe(220);
  });
});

describe("COL 保底", () => {
  it("各栏 default ≥ min,编辑器只有 min", () => {
    expect(COL.nav.default).toBeGreaterThanOrEqual(COL.nav.min);
    expect(COL.list.default).toBeGreaterThanOrEqual(COL.list.min);
    expect(COL.right.default).toBeGreaterThanOrEqual(COL.right.min);
    expect(COL.editor.min).toBeGreaterThan(0);
  });
});

describe("ColResizeHandle", () => {
  afterEach(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("右栏拖过上限停在 max,松手恢复 cursor", () => {
    const onChange = vi.fn();
    render(
      <ColResizeHandle
        width={200}
        min={100}
        max={240}
        side="right"
        onChange={onChange}
      />,
    );
    const handle = screen.getByTestId("col-resize-handle");
    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(document.body.style.cursor).toBe("col-resize");
    fireEvent.mouseMove(window, { clientX: 130 });
    expect(onChange).toHaveBeenLastCalledWith(230);
    fireEvent.mouseMove(window, { clientX: 400 });
    expect(onChange).toHaveBeenLastCalledWith(240);
    fireEvent.mouseUp(window);
    expect(document.body.style.cursor).toBe("");
    onChange.mockClear();
    fireEvent.mouseMove(window, { clientX: 410 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("左栏向左拖变宽,不低于 min", () => {
    const onChange = vi.fn();
    render(
      <ColResizeHandle
        width={200}
        min={180}
        side="left"
        onChange={onChange}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId("col-resize-handle"), {
      clientX: 300,
    });
    fireEvent.mouseMove(window, { clientX: 250 });
    expect(onChange).toHaveBeenLastCalledWith(250);
    fireEvent.mouseMove(window, { clientX: 500 });
    expect(onChange).toHaveBeenLastCalledWith(180);
    fireEvent.mouseUp(window);
  });
});
