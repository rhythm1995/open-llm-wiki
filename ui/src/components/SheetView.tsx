/**
 * SheetView —— F-SHEET v1 网格编辑器。
 * 持久化经 onSave 回写 `.sheet` JSON(sheet.ts)。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cellRef,
  colToLetters,
  evalCell,
  parseSheet,
  serializeSheet,
  setCell,
  type OpenObsidianSheet,
} from "../lib/sheet";
import type { TFunc } from "../lib/i18n";

interface Props {
  content: string;
  onSave: (next: string) => void;
  t: TFunc;
}

export function SheetView({ content, onSave, t }: Props) {
  const [doc, setDoc] = useState<OpenObsidianSheet>(() => parseSheet(content));
  const [active, setActive] = useState("A1");
  const [draft, setDraft] = useState("");

  // 外部切换文件时重载。
  useEffect(() => {
    const next = parseSheet(content);
    setDoc(next);
    setActive("A1");
    setDraft(next.cells["A1"] ?? "");
  }, [content]);

  const rows = doc.rows ?? 20;
  const cols = doc.cols ?? 10;

  const display = useMemo(() => {
    const m = new Map<string, string>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ref = cellRef(c, r);
        m.set(ref, evalCell(ref, doc.cells));
      }
    }
    return m;
  }, [doc.cells, rows, cols]);

  const commitActive = useCallback(() => {
    setDoc((prev) => {
      const next = setCell(prev, active, draft);
      onSave(serializeSheet(next));
      return next;
    });
  }, [active, draft, onSave]);

  const selectCell = (ref: string) => {
    if (ref !== active) {
      // 离开格先提交
      setDoc((prev) => {
        const next = setCell(prev, active, draft);
        onSave(serializeSheet(next));
        return next;
      });
    }
    setActive(ref);
    setDraft(doc.cells[ref] ?? "");
  };

  return (
    <div className="flex h-full flex-col" data-testid="sheet-view">
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
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-8 border border-crust bg-mantle" />
              {Array.from({ length: cols }, (_, c) => (
                <th
                  key={c}
                  className="min-w-[72px] border border-crust bg-mantle px-1 py-0.5 font-medium text-overlay"
                >
                  {colToLetters(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th className="sticky left-0 z-10 border border-crust bg-mantle px-1 text-overlay">
                  {r + 1}
                </th>
                {Array.from({ length: cols }, (_, c) => {
                  const ref = cellRef(c, r);
                  const selected = ref === active;
                  const raw = doc.cells[ref];
                  const shown = display.get(ref) ?? "";
                  return (
                    <td
                      key={ref}
                      data-testid={`sheet-cell-${ref}`}
                      className={
                        "max-w-[140px] cursor-cell truncate border border-crust px-1 py-0.5 " +
                        (selected
                          ? "bg-blue/15 outline outline-1 outline-blue"
                          : "bg-base hover:bg-surface/40")
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
    </div>
  );
}
