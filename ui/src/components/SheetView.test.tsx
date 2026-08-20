/**
 * SheetView 组件测试 —— 公式栏草稿的卸载提交(2026-08-15):
 * 切笔记时公式栏里未提交的草稿不再静默丢失;提交经 onFlush 携带本文件
 * (path, root) 定向写回,不污染切换后的新笔记。
 *
 * ironcalc WASM 引擎 mock 为不可用 → 走 native 求值;纯函数走真实实现。
 */
import { describe, it, expect, vi } from "vitest";
import { render, act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/sheet-ironcalc", () => ({
  evalSheetWithIroncalc: vi.fn(async () => null),
}));

import { SheetView } from "./SheetView";
import { emptySheetContent } from "../lib/sheet";
import type { TFunc } from "../lib/i18n";

const t = ((k: string) => k) as unknown as TFunc;
const noop = () => {};

function formulaInput(container: HTMLElement) {
  const el = container.querySelector('input[placeholder="sheet.formulaPlaceholder"]');
  if (!el) throw new Error("formula input not found");
  return el;
}

describe("SheetView 冻结 / 图表 / 多表", () => {
  it("改冻结行列走 onSave", () => {
    const onSave = vi.fn();
    render(<SheetView content={emptySheetContent()} onSave={onSave} t={t} />);
    fireEvent.change(screen.getByTestId("sheet-freeze-rows"), {
      target: { value: "2" },
    });
    expect(onSave).toHaveBeenCalled();
    const doc = JSON.parse(onSave.mock.calls.at(-1)![0] as string) as {
      sheets: { freezeRows: number; freezeCols: number }[];
    };
    expect(doc.sheets[0]!.freezeRows).toBe(2);
    fireEvent.change(screen.getByTestId("sheet-freeze-cols"), {
      target: { value: "1" },
    });
    const doc2 = JSON.parse(onSave.mock.calls.at(-1)![0] as string) as {
      sheets: { freezeCols: number }[];
    };
    expect(doc2.sheets[0]!.freezeCols).toBe(1);
  });

  it("添加图表后出现图表区", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<SheetView content={emptySheetContent()} onSave={onSave} t={t} />);
    expect(screen.queryByTestId("sheet-charts")).toBeNull();
    fireEvent.change(screen.getByTestId("sheet-chart-range"), {
      target: { value: "A1:B2" },
    });
    await user.click(screen.getByTestId("sheet-add-chart"));
    expect(screen.getByTestId("sheet-charts")).toBeInTheDocument();
    const saved = JSON.parse(onSave.mock.calls.at(-1)![0] as string) as {
      charts: { range: string; type: string }[];
    };
    expect(saved.charts[0]!.range).toBe("A1:B2");
    expect(saved.charts[0]!.type).toBe("bar");
  });

  it("加表页增加 tab", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<SheetView content={emptySheetContent()} onSave={onSave} t={t} />);
    const tabs = screen.getByTestId("sheet-tabs");
    expect(tabs.querySelectorAll("button").length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByTestId("sheet-add-tab"));
    const saved = JSON.parse(onSave.mock.calls.at(-1)![0] as string) as {
      sheets: unknown[];
    };
    expect(saved.sheets).toHaveLength(2);
  });
});

describe("SheetView 公式栏草稿", () => {
  it("卸载时提交未落盘草稿(经 onFlush 定向写回本文件)", () => {
    const onSave = vi.fn();
    const onFlush = vi.fn();
    const { container, unmount } = render(
      <SheetView
        content={emptySheetContent()}
        onSave={onSave}
        t={t}
        notePath="data.sheet"
        root="/v"
        onFlush={onFlush}
      />,
    );
    fireEvent.change(formulaInput(container), { target: { value: "42" } });
    act(() => unmount());
    expect(onFlush).toHaveBeenCalledTimes(1);
    const [path, root, next] = onFlush.mock.calls[0]!;
    expect(path).toBe("data.sheet");
    expect(root).toBe("/v");
    // 草稿进入 A1 单元格。
    const cells = (JSON.parse(next) as { sheets: { cells: Record<string, string> }[] }).sheets[0]!
      .cells;
    expect(cells.A1).toBe("42");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("草稿未变时卸载不写(防回环)", () => {
    const onFlush = vi.fn();
    const { unmount } = render(
      <SheetView
        content={emptySheetContent()}
        onSave={noop}
        t={t}
        notePath="data.sheet"
        root="/v"
        onFlush={onFlush}
      />,
    );
    act(() => unmount());
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("公式栏 Enter 提交走 onSave;IME 组合期 Enter 不提交", () => {
    const onSave = vi.fn();
    const { container } = render(
      <SheetView content={emptySheetContent()} onSave={onSave} t={t} />,
    );
    const input = formulaInput(container);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toContain('"A1": "7"');
  });
});
