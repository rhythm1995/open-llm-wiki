/**
 * ReadingView —— 中栏:渲染后的阅读视图(F-READING)。
 *
 * 把当前笔记正文渲染成 HTML(marked),`[[wikilink]]` 已预处理为带 data-target
 * 的链接;点击走事件委托(.closest(".wikilink"))→ onFollow(target),与编辑器
 * 的 Cmd+点击跟随同一条解析路径(resolveWikiTarget)。
 *
 * 安全:注入 DOM 前经 `sanitize()`(DOMPurify)清洗——剥离 `<script>`、内联
 * `on*` 处理器等,同时保留点击委托依赖的 `data-target`/`class`。即便 vault 里
 * 混入了他人提供的恶意 md,也不会执行任意脚本。正文居中限宽,配色随主题变量自动适应明/暗。
 */
import { useMemo } from "react";
import { renderMarkdown, sanitize } from "../lib/render";
import type { TFunc } from "../lib/i18n";

interface Props {
  content: string;
  hasNote: boolean;
  onFollow: (target: string) => void;
  t: TFunc;
}

export function ReadingView({ content, hasNote, onFollow, t }: Props) {
  const html = useMemo(() => sanitize(renderMarkdown(content)), [content]);

  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">{t("empty.selectOrCreate")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <article
        className="rendered mx-auto max-w-3xl px-10 py-8"
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
            ".wikilink",
          );
          if (a) {
            e.preventDefault();
            onFollow(a.dataset.target ?? "");
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
