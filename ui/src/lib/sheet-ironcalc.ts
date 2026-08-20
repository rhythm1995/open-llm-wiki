/**
 * sheet-ironcalc —— 可选 IronCalc WASM 引擎增强(F-SHEET)。
 *
 * 把 OpenLlmWikiSheet 灌进 ironcalc Model 求值,拿回格式化显示值。
 * 失败(未 init / wasm 不可用)时返回 null,调用方回退 sheet.ts 自研引擎。
 *
 * 许可:MIT/Apache-2.0,见 THIRD_PARTY_NOTICES。
 */
import type { OpenLlmWikiSheet } from "./sheet";
import { activeTab, cellRef, parseCellRef } from "./sheet";

type IronModel = {
  free(): void;
  setUserInput(sheet: number, row: number, column: number, input: string): void;
  evaluate(): void;
  getFormattedCellValue(sheet: number, row: number, column: number): string;
  getCellContent(sheet: number, row: number, column: number): string;
  newSheet(): void;
  renameSheet(sheet: number, name: string): void;
  setFrozenRowsCount(sheet: number, count: number): void;
  setFrozenColumnsCount(sheet: number, count: number): void;
};

let initPromise: Promise<boolean> | null = null;
let ModelCtor: (new (
  name: string,
  locale: string,
  timezone: string,
  language_id: string,
) => IronModel) | null = null;

/** 测试用:丢掉懒加载单例,以便下一例重新 mock wasm。 */
export function resetIroncalcForTests(): void {
  initPromise = null;
  ModelCtor = null;
}

/** 懒加载 wasm;测试环境通常失败 → false。 */
export function ensureIroncalc(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const mod = await import("@ironcalc/wasm");
      // default export is init
      const init = (mod as { default?: () => Promise<unknown> }).default;
      if (typeof init === "function") await init();
      const M = (mod as { Model?: typeof ModelCtor }).Model;
      if (!M) return false;
      ModelCtor = M;
      return true;
    } catch {
      return false;
    }
  })();
  return initPromise;
}

/**
 * 用 ironcalc 求值整个 active 表(或指定 sheet),返回 ref → display。
 * 不可用时返回 null。
 */
export async function evalSheetWithIroncalc(
  doc: OpenLlmWikiSheet,
  sheetId?: string,
): Promise<Map<string, string> | null> {
  const ok = await ensureIroncalc();
  if (!ok || !ModelCtor) return null;

  let model: IronModel | null = null;
  try {
    model = new ModelCtor("Open LLM Wiki", "en", "UTC", "en");
    // ironcalc 默认已有 sheet 0;额外 sheet 用 newSheet
    for (let si = 0; si < doc.sheets.length; si++) {
      if (si > 0) model.newSheet();
      try {
        model.renameSheet(si, doc.sheets[si].name);
      } catch {
        /* rename optional */
      }
      const tab = doc.sheets[si];
      try {
        model.setFrozenRowsCount(si, tab.freezeRows);
        model.setFrozenColumnsCount(si, tab.freezeCols);
      } catch {
        /* optional */
      }
      for (const [ref, raw] of Object.entries(tab.cells)) {
        const p = parseCellRef(ref);
        if (!p) continue;
        // ironcalc rows/cols are 1-based
        model.setUserInput(si, p.row + 1, p.col + 1, raw);
      }
    }
    model.evaluate();

    const tab =
      doc.sheets.find((s) => s.id === (sheetId ?? doc.activeSheetId)) ??
      activeTab(doc);
    const sheetIndex = doc.sheets.findIndex((s) => s.id === tab.id);
    const si = sheetIndex >= 0 ? sheetIndex : 0;
    const out = new Map<string, string>();
    for (let r = 0; r < tab.rows; r++) {
      for (let c = 0; c < tab.cols; c++) {
        const ref = cellRef(c, r);
        try {
          const v = model.getFormattedCellValue(si, r + 1, c + 1);
          out.set(ref, v ?? "");
        } catch {
          out.set(ref, "");
        }
      }
    }
    return out;
  } catch {
    return null;
  } finally {
    try {
      model?.free();
    } catch {
      /* ignore */
    }
  }
}
