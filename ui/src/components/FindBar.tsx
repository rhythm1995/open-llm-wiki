/**
 * FindBar —— 文档内查找条(⌘F,Obsidian 式「大搜索」的文档内一半;全库另一半是 ⌘⇧F)。
 *
 * 用 web 原生 `window.find()` 在当前笔记里查下一个 / 上一个。对 source(CodeMirror)
 * 与 wysiwyg(BlockNote / ProseMirror)都生效——两者都把正文渲染成真实 DOM 文本节点,
 * `window.find()` 能定位。无第三方依赖、无替换;逃生舱是切到 source 模式。
 *
 * 与第二栏「列表过滤」的职责区分:FindBar 查的是**当前打开笔记正文**;列表过滤查的
 * 是**当前列表的标题/预览**;⌘⇧F(SearchPanel)查的是**全库正文**。三者 scope 递增。
 *
 * 限制:`window.find()` 非标准(Chromium/WebKit 支持,WKWebView 尽力而为,无替换)。
 * 若真机验证不稳,后续可给 source 模式换 `@codemirror/search`(见路线图)。
 */
import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, MagnifyingGlass, X } from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";

interface Props {
  /** 受控查询串(由 App 持有,跨 FindBar 开关保持)。 */
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  t: TFunc;
}

export function FindBar({ query, onQueryChange, onClose, t }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 打开即聚焦 + 全选,便于直接覆盖上次的查询。
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  /** 调 window.find 查找;backward=true 找上一个。无查询 / 不可用时静默。 */
  const find = (backward: boolean) => {
    if (!query) return;
    const w = window as unknown as {
      find?: (q: string, caseSensitive?: boolean, backward?: boolean) => boolean;
    };
    w.find?.(query, false, backward);
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
      <button
        onClick={() => find(true)}
        title={t("find.prev")}
        aria-label={t("find.prev")}
        className="rounded p-0.5 text-overlay hover:bg-surface hover:text-text"
      >
        <ArrowUp size={13} />
      </button>
      <button
        onClick={() => find(false)}
        title={t("find.next")}
        aria-label={t("find.next")}
        className="rounded p-0.5 text-overlay hover:bg-surface hover:text-text"
      >
        <ArrowDown size={13} />
      </button>
      <button
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
