/**
 * FindBar —— 文档内查找条(⌘F,Tolaria 式 in-note find)。
 *
 * 样式:浮动条(占位符/上一个/下一个/关闭)。
 * 功能:对当前笔记正文全文查找 + 高亮全部匹配(CodeMirror SearchQuery)。
 * 在 wysiwyg 下由 App 临时切到 source 再查,保证高亮可靠(BlockNote 无对等高亮 API)。
 *
 * 匹配数由纯逻辑 find-in-doc 计算(与 CM 字面量/不区分大小写语义对齐)。
 */
import { useEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowUp, MagnifyingGlass, X } from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";
import { findInDocument } from "../lib/find-in-doc";
import type { EditorHandle } from "./Editor";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  t: TFunc;
  /** CodeMirror 句柄;必须提供才能高亮(App 保证 source 模式)。 */
  editor: EditorHandle | null;
  /** 当前笔记全文(含 frontmatter),用于计数展示。 */
  documentText: string;
}

export function FindBar({
  query,
  onQueryChange,
  onClose,
  t,
  editor,
  documentText,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const matchCount = useMemo(
    () => findInDocument(documentText, query).matches.length,
    [documentText, query],
  );

  // 打开即聚焦 + 全选。
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // query 变化:立刻刷新全文高亮并跳到第一处(若有)。
  useEffect(() => {
    if (!editor) return;
    if (!query) {
      editor.clearFind();
      return;
    }
    editor.find(query, false);
  }, [query, editor]);

  const find = (backward: boolean) => {
    if (!query || !editor) return;
    editor.find(query, backward);
  };

  return (
    <div
      data-testid="find-bar"
      className="absolute right-2 top-10 z-20 flex items-center gap-1 rounded border border-crust bg-mantle px-1.5 py-1 shadow-lg"
    >
      <MagnifyingGlass size={13} className="shrink-0 text-overlay" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            find(e.shiftKey);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={t("find.placeholder")}
        className="w-40 bg-transparent px-1 text-[12px] text-text outline-none"
      />
      {query ? (
        <span
          data-testid="find-count"
          className="shrink-0 px-0.5 text-[11px] tabular-nums text-overlay"
        >
          {matchCount > 0 ? matchCount : t("find.none")}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => find(true)}
        title={t("find.prev")}
        aria-label={t("find.prev")}
        className="rounded p-0.5 text-overlay hover:bg-surface hover:text-text"
      >
        <ArrowUp size={13} />
      </button>
      <button
        type="button"
        onClick={() => find(false)}
        title={t("find.next")}
        aria-label={t("find.next")}
        className="rounded p-0.5 text-overlay hover:bg-surface hover:text-text"
      >
        <ArrowDown size={13} />
      </button>
      <button
        type="button"
        onClick={onClose}
        title={t("common.close")}
        aria-label={t("common.close")}
        className="rounded p-0.5 text-overlay hover:bg-surface hover:text-text"
      >
        <X size={13} />
      </button>
    </div>
  );
}
