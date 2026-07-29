/**
 * SearchPanel —— 全文检索面板(AND 匹配,标题权重×2,由 core 实现)。
 *
 * 与 QQL 互补:QQL 查结构(frontmatter/标签),搜索查内容。命中按分数降序,
 * 点击跳转。mock 浏览器模式下返回空,真机走 Rust core。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ipc, type SearchHit, type VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { TFunc } from "../lib/i18n";

interface Props {
  root: string | null;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
  t: TFunc;
}

export function SearchPanel({ root, snapshot, actions, t }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 进入 search 视图(⌘⇧F 或点工具栏按钮)即聚焦输入,免一次点击。
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const idToNode = useMemo(() => {
    const m = new Map<number, { title: string; path: string }>();
    for (const n of snapshot?.nodes ?? []) m.set(n.id, { title: n.title, path: n.path });
    return m;
  }, [snapshot]);

  const run = async () => {
    if (!root || !q.trim()) {
      setHits([]);
      return;
    }
    try {
      setHits(await ipc.searchNotes(root, q));
    } catch {
      setHits([]);
    }
  };

  return (
    <div className="flex h-full flex-col bg-base">
      <div className="border-b border-crust p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-overlay">
          <MagnifyingGlass size={12} />
          {t("search.title")}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
            placeholder={t("search.placeholder")}
            className="flex-1 rounded bg-crust px-2 py-1 text-[12px] text-text outline-none focus:ring-1 focus:ring-surface2"
          />
          <button
            onClick={() => void run()}
            disabled={!root}
            className="rounded bg-surface px-2 py-1 text-[12px] text-text hover:bg-surface2 disabled:opacity-40"
          >
            {t("search.go")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hits &&
          hits.map((h) => {
            const node = idToNode.get(h.id);
            if (!node) return null;
            return (
              <button
                key={h.id}
                onClick={() => actions.selectNote(node.path)}
                className="block w-full px-3 py-1.5 text-left hover:bg-surface"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-[13px] text-text">
                    {node.title}
                  </span>
                  <span className="ml-2 shrink-0 text-[10px] text-overlay">
                    {h.score.toFixed(1)}
                  </span>
                </div>
                <div className="truncate text-[11px] text-overlay">
                  {node.path}
                </div>
              </button>
            );
          })}
        {hits && hits.length === 0 && (
          <p className="p-3 text-[12px] text-overlay">{t("search.empty")}</p>
        )}
      </div>
    </div>
  );
}
