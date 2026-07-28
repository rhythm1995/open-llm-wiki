/**
 * TrashPanel —— 回收站视图(F-TRASH)。
 *
 * 列出 `.trash/` 内的笔记(原始路径还原展示),逐篇「还原 / 彻底删除」,
 * 顶部可一键清空。还原与清空的实际移动/删除走 store 动作,路径语义在 lib/trash。
 *
 * 设计:与编辑器视图一致的中栏单面板;空态给出明确引导。
 */
import { useState } from "react";
import { Trash, ArrowUUpLeft, Eraser, FileText } from "@phosphor-icons/react";
import type { VaultEntry } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { restorePath } from "../lib/trash";
import { cn } from "../lib/cn";

interface Props {
  trash: VaultEntry[];
  actions: VaultActions;
}

export function TrashPanel({ trash, actions }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = [...trash].sort((a, b) =>
    restorePath(a.path).localeCompare(restorePath(b.path)),
  );

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-base">
      <div className="flex items-center gap-2 border-b border-crust px-4 py-2.5">
        <Trash size={16} className="text-overlay" />
        <h2 className="text-[13px] font-medium text-text">回收站</h2>
        <span className="text-[12px] text-overlay">{trash.length} 篇</span>
        <button
          onClick={() =>
            trash.length &&
            window.confirm(`彻底清空回收站(共 ${trash.length} 篇)?此操作不可撤销。`) &&
            run("empty", () => actions.emptyTrash())
          }
          disabled={trash.length === 0}
          className={cn(
            "ml-auto flex items-center gap-1 rounded px-2 py-1 text-[12px]",
            trash.length === 0
              ? "cursor-not-allowed text-overlay/50"
              : "text-red hover:bg-red/10",
          )}
          title="清空回收站"
        >
          <Eraser size={13} />
          清空
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-overlay">
            <Trash size={28} weight="thin" />
            <p className="text-[13px]">回收站为空。</p>
            <p className="text-[12px]">删除的笔记会先到这里,可随时恢复。</p>
          </div>
        ) : (
          sorted.map((e) => {
            const orig = restorePath(e.path);
            const stem = orig.split("/").pop() ?? orig;
            const dir = orig.includes("/")
              ? orig.slice(0, orig.lastIndexOf("/"))
              : "";
            return (
              <div
                key={e.path}
                className="group flex items-center gap-2 rounded px-2.5 py-1.5 text-[13px] hover:bg-surface"
              >
                <FileText size={14} className="shrink-0 text-overlay" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-text">{stem}</div>
                  {dir && (
                    <div className="truncate text-[11px] text-overlay">{dir}</div>
                  )}
                </div>
                <button
                  onClick={() =>
                    run(`restore-${e.path}`, () => actions.restoreNote(e.path))
                  }
                  disabled={busy !== null}
                  className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-subtext hover:bg-surface2 hover:text-text disabled:opacity-50"
                  title="还原"
                >
                  <ArrowUUpLeft size={13} />
                  还原
                </button>
                <button
                  onClick={() =>
                    window.confirm(`彻底删除「${stem}」?此操作不可撤销。`) &&
                    run(`purge-${e.path}`, () => actions.purgeNote(e.path))
                  }
                  disabled={busy !== null}
                  className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-overlay hover:bg-red/10 hover:text-red disabled:opacity-50"
                  title="彻底删除"
                >
                  <Trash size={13} />
                  删除
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
