/**
 * CanvasView 组件测试 —— 防抖 timer 幸存竞态(2026-08-15 修复):
 * 卸载后 timer 不得再触发 onSave(此前会把画布 JSON 写进切换后激活的任何笔记);
 * 未落盘的尾编辑经 onFlush 携带本文件 (path, root) 定向写回。
 *
 * Excalidraw 运行时重(依赖 canvas),mock 成按钮:点击即触发 onChange。
 * 序列化/解析走真实 lib/canvas 纯函数。
 */
import { describe, it, expect, vi } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { useEffect } from "react";

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: { onChange: (els: never[], st: never, files: never) => void }) => {
    useEffect(() => {
      props.onChange([], {} as never, {} as never);
    }, []);
    return (
      <button
        data-testid="excal-mock"
        onClick={() =>
          props.onChange([{ id: "el1", type: "rectangle" } as never], {} as never, {} as never)
        }
      />
    );
  },
}));

import { CanvasView } from "./CanvasView";
import type { TFunc } from "../lib/i18n";

const t = ((k: string) => k) as unknown as TFunc;
const noop = () => {};

function drawOnCanvas() {
  const btn = document.querySelector('[data-testid="excal-mock"]')!;
  fireEvent.pointerDown(btn);
  fireEvent.click(btn);
}

describe("CanvasView 保存竞态", () => {
  it("防抖到点走 onSave(当前画布正常路径)", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const onFlush = vi.fn();
    render(
      <CanvasView content="" onSave={onSave} t={t} notePath="c.canvas" root="/v" onFlush={onFlush} />,
    );
    act(() => drawOnCanvas());
    act(() => vi.advanceTimersByTime(400));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onFlush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("卸载清 timer:尾编辑经 onFlush 定向写回,onSave 不再被迟到触发", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const onFlush = vi.fn();
    const { unmount } = render(
      <CanvasView content="" onSave={onSave} t={t} notePath="c.canvas" root="/v" onFlush={onFlush} />,
    );
    act(() => drawOnCanvas());
    // 防抖未到就卸载(切笔记)→ timer 被清,尾编辑走所有权回写。
    act(() => unmount());
    expect(onFlush).toHaveBeenCalledTimes(1);
    const [path, root, next] = onFlush.mock.calls[0]!;
    expect(path).toBe("c.canvas");
    expect(root).toBe("/v");
    expect(JSON.parse(next).elements).toEqual([{ id: "el1", type: "rectangle" }]);
    act(() => vi.advanceTimersByTime(400));
    expect(onSave).not.toHaveBeenCalled(); // 关键:幸存 timer 已不存在
    vi.useRealTimers();
  });

  it("挂载自触发 onChange 不落盘", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const onFlush = vi.fn();
    const { unmount } = render(
      <CanvasView content="" onSave={onSave} t={t} notePath="c.canvas" root="/v" onFlush={onFlush} />,
    );
    act(() => vi.advanceTimersByTime(400));
    act(() => unmount());
    expect(onSave).not.toHaveBeenCalled();
    expect(onFlush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("无实质变化时卸载不写(防回环)", () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const { unmount } = render(
      <CanvasView content="" onSave={noop} t={t} notePath="c.canvas" root="/v" onFlush={onFlush} />,
    );
    act(() => unmount());
    expect(onFlush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("未接线 onFlush 时卸载只清 timer,不写不崩(兼容回退)", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const { unmount } = render(
      <CanvasView content="" onSave={onSave} t={t} />,
    );
    act(() => fireEvent.click(document.querySelector('[data-testid="excal-mock"]')!));
    act(() => unmount());
    act(() => vi.advanceTimersByTime(400));
    expect(onSave).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
