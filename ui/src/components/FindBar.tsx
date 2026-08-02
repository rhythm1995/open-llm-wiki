/**
 * FindBar —— 文档内查找/替换条(⌘F)。
 *
 * 查找:全文高亮 + 上一个/下一个(CodeMirror SearchQuery)。
 * 替换:source 模式经 EditorHandle;wysiwyg 时 App 会切到 source 再查。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";
import { findInDocument } from "../lib/find-in-doc";
import type { EditorHandle } from "./Editor";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  t: TFunc;
  /** CodeMirror 句柄;必须提供才能高亮/替换(App 保证 source 模式)。 */
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
  const [replace, setReplace] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const matchCount = useMemo(
    () => findInDocument(documentText, query).matches.length,
    [documentText, query],
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

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

  const doReplaceNext = () => {
    if (!query || !editor) return;
    editor.replaceNext(query, replace);
  };

  const doReplaceAll = () => {
    if (!query || !editor) return;
    editor.replaceAll(query, replace);
  };

  return (
    <div
      data-testid="find-bar"
      className="absolute right-2 top-10 z-20 flex flex-col gap-1 rounded border border-crust bg-mantle px-1.5 py-1 shadow-lg"
    >
      <div className="flex items-center gap-1">
        <MagnifyingGlass size={13} className="shrink-0 text-overlay" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.altKey) {
              e.preventDefault();
              if (e.metaKey || e.ctrlKey) {
                doReplaceNext();
              } else {
                find(e.shiftKey);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={t("find.placeholder")}
          className="w-40 bg-transparent px-1 text-[12px] text-text outline-none"
          data-testid="find-query"
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
          data-testid="find-toggle-replace"
          onClick={() => setShowReplace((v) => !v)}
          title={t("find.toggleReplace")}
          aria-label={t("find.toggleReplace")}
          className="rounded px-1 text-[11px] text-overlay hover:bg-surface hover:text-text"
        >
          {showReplace ? t("find.hideReplace") : t("find.showReplace")}
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
      {showReplace && (
        <div className="flex items-center gap-1 border-t border-crust pt-1">
          <span className="w-[13px] shrink-0" />
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.metaKey || e.ctrlKey || e.altKey) doReplaceAll();
                else doReplaceNext();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={t("find.replacePlaceholder")}
            className="w-40 bg-transparent px-1 text-[12px] text-text outline-none"
            data-testid="find-replace"
          />
          <button
            type="button"
            data-testid="find-replace-one"
            onClick={doReplaceNext}
            disabled={!query || !editor}
            className="rounded px-1.5 py-0.5 text-[11px] text-overlay hover:bg-surface hover:text-text disabled:opacity-40"
          >
            {t("find.replace")}
          </button>
          <button
            type="button"
            data-testid="find-replace-all"
            onClick={doReplaceAll}
            disabled={!query || !editor}
            className="rounded px-1.5 py-0.5 text-[11px] text-overlay hover:bg-surface hover:text-text disabled:opacity-40"
          >
            {t("find.replaceAll")}
          </button>
        </div>
      )}
    </div>
  );
}
