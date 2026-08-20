/**
 * sheet-ironcalc —— wasm 不可用时返回 null(回退 sheet.ts);可用时灌格并 free。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OpenLlmWikiSheet } from "./sheet";

const doc = (): OpenLlmWikiSheet => ({
  openLlmWikiSheet: 2,
  sheets: [
    {
      id: "s1",
      name: "Sheet1",
      cells: { A1: "1", B1: "=A1+1" },
      rows: 1,
      cols: 2,
      freezeRows: 1,
      freezeCols: 0,
    },
    {
      id: "s2",
      name: "Two",
      cells: {},
      rows: 1,
      cols: 1,
      freezeRows: 0,
      freezeCols: 0,
    },
  ],
  activeSheetId: "s1",
  charts: [],
});

describe("evalSheetWithIroncalc 不可用", () => {
  it("jsdom 无 wasm → null", async () => {
    const { resetIroncalcForTests, evalSheetWithIroncalc } = await import(
      "./sheet-ironcalc"
    );
    resetIroncalcForTests();
    expect(await evalSheetWithIroncalc(doc())).toBeNull();
  });
});

describe("evalSheetWithIroncalc 可用", () => {
  const free = vi.fn();
  const setUserInput = vi.fn();
  const newSheet = vi.fn();
  const renameSheet = vi.fn();
  const evaluate = vi.fn();
  const getFormattedCellValue = vi.fn(
    (_si: number, r: number, c: number) => `${r}:${c}`,
  );

  beforeEach(() => {
    free.mockClear();
    setUserInput.mockClear();
    newSheet.mockClear();
    renameSheet.mockClear();
    evaluate.mockClear();
    getFormattedCellValue.mockClear();
    vi.resetModules();
    vi.doMock("@ironcalc/wasm", () => ({
      default: async () => {},
      Model: class {
        free = free;
        setUserInput = setUserInput;
        newSheet = newSheet;
        renameSheet = renameSheet;
        evaluate = evaluate;
        getFormattedCellValue = getFormattedCellValue;
        getCellContent = vi.fn();
        setFrozenRowsCount = vi.fn();
        setFrozenColumnsCount = vi.fn();
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@ironcalc/wasm");
    vi.resetModules();
  });

  it("灌格求值,多表 newSheet,结束 free", async () => {
    const { evalSheetWithIroncalc } = await import("./sheet-ironcalc");
    const out = await evalSheetWithIroncalc(doc());
    expect(out).not.toBeNull();
    expect(setUserInput).toHaveBeenCalled();
    expect(newSheet).toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalled();
    expect(out?.get("A1")).toBe("1:1");
    expect(out?.get("B1")).toBe("1:2");
    expect(free).toHaveBeenCalled();
  });
});
