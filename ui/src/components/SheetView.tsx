/**
 * SheetView —— F-SHEET v2 网格:多表、冻结、图表、ironcalc 可选求值。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeTab,
  addSheet,
  cellRef,
  chartDataFromRange,
  colToLetters,
  evalAllDisplay,
  parseSheet,
  removeChart,
  removeSheet,
  renderChartSvg,
  renameSheet,
  serializeSheet,
  setActiveSheet,
  setCell,
  setFreeze,
  upsertChart,
  type ChartType,
  type OpenLlmWikiSheet,
} from "../lib/sheet";
import { evalSheetWithIroncalc } from "../lib/sheet-ironcalc";
import type { TFunc } from "../lib/i18n";

interface Props {
  content: string;
  onSave: (next: string) => void;
  t: TFunc;
}

export function SheetView({ content, onSave, t }: Props) {
  const [doc, setDoc] = useState<OpenLlmWikiSheet>(() => parseSheet(content));
  const [active, setActive] = useState("A1");
  const [draft, setDraft] = useState("");
  const [engine, setEngine] = useState<"native" | "ironcalc">("native");
  const [icDisplay, setIcDisplay] = useState<Map<string, string> | null>(null);
  const [chartRange, setChartRange] = useState("A1:B5");
  const [chartType, setChartType] = useState<ChartType>("bar");

  useEffect(() => {
    const next = parseSheet(content);
    setDoc(next);
    setActive("A1");
    const tab = activeTab(next);
    setDraft(tab.cells["A1"] ?? "");
  }, [content]);

  const tab = activeTab(doc);

  const nativeDisplay = useMemo(
    () => evalAllDisplay(doc, tab.id),
    [doc, tab.id],
  );

  // 尝试 ironcalc 增强
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const m = await evalSheetWithIroncalc(doc, tab.id);
      if (cancelled) return;
      if (m) {
        setIcDisplay(m);
        setEngine("ironcalc");
      } else {
        setIcDisplay(null);
        setEngine("native");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, tab.id]);

  const display = icDisplay ?? nativeDisplay;

  const persist = useCallback(
    (next: OpenLlmWikiSheet) => {
      setDoc(next);
      onSave(serializeSheet(next));
    },
    [onSave],
  );

  const commitActive = useCallback(() => {
    const next = setCell(doc, active, draft, tab.id);
    persist(next);
  }, [doc, active, draft, tab.id, persist]);

  const selectCell = (ref: string) => {
    if (ref !== active) {
      const next = setCell(doc, active, draft, tab.id);
      persist(next);
      const cells =
        next.sheets.find((s) => s.id === tab.id)?.cells ?? tab.cells;
      setDraft(cells[ref] ?? "");
    } else {
      setDraft(tab.cells[ref] ?? "");
    }
    setActive(ref);
  };

  const switchSheet = (id: string) => {
    const next = setCell(doc, active, draft, tab.id);
    const switched = setActiveSheet(next, id);
    persist(switched);
    setActive("A1");
    const t2 = activeTab(switched);
    setDraft(t2.cells["A1"] ?? "");
  };

  return (
    <div className="flex h-full flex-col" data-testid="sheet-view">
      {/* 公式栏 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-crust bg-mantle px-2 py-1">
        <span className="w-10 font-mono text-[12px] text-overlay">{active}</span>
        <input
          className="min-w-0 flex-1 rounded border border-crust bg-base px-2 py-1 font-mono text-[13px] text-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitActive}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitActive();
            }
          }}
          placeholder={t("sheet.formulaPlaceholder")}
          spellCheck={false}
        />
        <span
          className="shrink-0 text-[10px] text-overlay"
          title={t("sheet.engineHint")}
          data-testid="sheet-engine"
        >
          {engine === "ironcalc" ? "IronCalc" : "native"}
        </span>
      </div>

      {/* 冻结 + 图表工具 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-crust bg-mantle/80 px-2 py-1 text-[11px]">
        <label className="flex items-center gap-1 text-subtext">
          {t("sheet.freezeRows")}
          <input
            type="number"
            min={0}
            max={10}
            className="w-12 rounded border border-crust bg-base px-1 py-0.5"
            value={tab.freezeRows}
            data-testid="sheet-freeze-rows"
            onChange={(e) =>
              persist(
                setFreeze(
                  doc,
                  tab.id,
                  Number(e.target.value) || 0,
                  tab.freezeCols,
                ),
              )
            }
          />
        </label>
        <label className="flex items-center gap-1 text-subtext">
          {t("sheet.freezeCols")}
          <input
            type="number"
            min={0}
            max={5}
            className="w-12 rounded border border-crust bg-base px-1 py-0.5"
            value={tab.freezeCols}
            data-testid="sheet-freeze-cols"
            onChange={(e) =>
              persist(
                setFreeze(
                  doc,
                  tab.id,
                  tab.freezeRows,
                  Number(e.target.value) || 0,
                ),
              )
            }
          />
        </label>
        <span className="mx-1 h-3 w-px bg-crust" />
        <input
          className="w-24 rounded border border-crust bg-base px-1 py-0.5 font-mono"
          value={chartRange}
          onChange={(e) => setChartRange(e.target.value)}
          title={t("sheet.chartRange")}
        />
        <select
          className="rounded border border-crust bg-base px-1 py-0.5"
          value={chartType}
          onChange={(e) => setChartType(e.target.value as ChartType)}
        >
          <option value="bar">{t("sheet.chartBar")}</option>
          <option value="line">{t("sheet.chartLine")}</option>
        </select>
        <button
          type="button"
          className="rounded bg-surface px-2 py-0.5 text-text hover:bg-surface2"
          data-testid="sheet-add-chart"
          onClick={() => {
            const id = `c_${Date.now()}`;
            persist(
              upsertChart(doc, {
                id,
                type: chartType,
                title: chartType,
                sheetId: tab.id,
                range: chartRange.toUpperCase(),
              }),
            );
          }}
        >
          {t("sheet.addChart")}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 网格 */}
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-8 border border-crust bg-mantle" />
                {Array.from({ length: tab.cols }, (_, c) => (
                  <th
                    key={c}
                    className={
                      "sticky top-0 z-10 min-w-[72px] border border-crust bg-mantle px-1 py-0.5 font-medium text-overlay " +
                      (c < tab.freezeCols ? "left-8 z-[15]" : "")
                    }
                    style={
                      c < tab.freezeCols
                        ? { position: "sticky", left: 32 + c * 72 }
                        : undefined
                    }
                  >
                    {colToLetters(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: tab.rows }, (_, r) => (
                <tr key={r}>
                  <th
                    className={
                      "sticky left-0 z-10 border border-crust bg-mantle px-1 text-overlay " +
                      (r < tab.freezeRows ? "top-6" : "")
                    }
                  >
                    {r + 1}
                  </th>
                  {Array.from({ length: tab.cols }, (_, c) => {
                    const ref = cellRef(c, r);
                    const selected = ref === active;
                    const raw = tab.cells[ref];
                    const shown = display.get(ref) ?? "";
                    const frozen =
                      r < tab.freezeRows || c < tab.freezeCols;
                    return (
                      <td
                        key={ref}
                        data-testid={`sheet-cell-${ref}`}
                        className={
                          "max-w-[140px] cursor-cell truncate border border-crust px-1 py-0.5 " +
                          (selected
                            ? "bg-blue/15 outline outline-1 outline-blue "
                            : frozen
                              ? "bg-surface/50 "
                              : "bg-base hover:bg-surface/40 ")
                        }
                        style={
                          c < tab.freezeCols
                            ? {
                                position: "sticky",
                                left: 32 + c * 72,
                                zIndex: 5,
                              }
                            : undefined
                        }
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCell(ref);
                        }}
                        title={raw?.startsWith("=") ? raw : shown}
                      >
                        {shown}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 图表侧栏 */}
        {doc.charts.filter((c) => c.sheetId === tab.id).length > 0 && (
          <div
            className="w-72 shrink-0 overflow-auto border-l border-crust bg-base p-2"
            data-testid="sheet-charts"
          >
            {doc.charts
              .filter((c) => c.sheetId === tab.id)
              .map((ch) => {
                const data = chartDataFromRange(doc, tab.id, ch.range);
                const svg = renderChartSvg(data, ch.type, 260, 140);
                return (
                  <div key={ch.id} className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-subtext">
                      <span>
                        {ch.title || ch.type} ({ch.range})
                      </span>
                      <button
                        type="button"
                        className="text-overlay hover:text-red"
                        onClick={() => persist(removeChart(doc, ch.id))}
                      >
                        ×
                      </button>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: svg }} />
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 表标签 */}
      <div
        className="flex shrink-0 items-center gap-1 border-t border-crust bg-mantle px-1 py-0.5"
        data-testid="sheet-tabs"
      >
        {doc.sheets.map((s) => (
          <button
            key={s.id}
            type="button"
            className={
              "rounded px-2 py-0.5 text-[12px] " +
              (s.id === tab.id
                ? "bg-surface text-text"
                : "text-subtext hover:bg-surface/60")
            }
            onClick={() => switchSheet(s.id)}
            onDoubleClick={() => {
              const name = window.prompt(t("sheet.renameTab"), s.name);
              if (name?.trim()) persist(renameSheet(doc, s.id, name.trim()));
            }}
          >
            {s.name}
          </button>
        ))}
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[12px] text-overlay hover:bg-surface"
          data-testid="sheet-add-tab"
          onClick={() => persist(addSheet(doc))}
          title={t("sheet.addTab")}
        >
          +
        </button>
        {doc.sheets.length > 1 && (
          <button
            type="button"
            className="ml-auto rounded px-2 py-0.5 text-[11px] text-overlay hover:text-red"
            onClick={() => persist(removeSheet(doc, tab.id))}
            title={t("sheet.removeTab")}
          >
            −
          </button>
        )}
      </div>
    </div>
  );
}
