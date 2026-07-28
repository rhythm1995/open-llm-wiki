/**
 * ReadingView —— 中栏:渲染后的阅读视图(F-READING)。
 *
 * 把当前笔记正文渲染成 HTML(marked),`[[wikilink]]` 已预处理为带 data-target
 * 的链接;点击走事件委托(.closest(".wikilink"))→ onFollow(target),与编辑器
 * 的 Cmd+点击跟随同一条解析路径(resolveWikiTarget)。
 *
 * 渲染用户本地 vault 内容,语义与 Obsidian 渲染用户内容同性质;正文居中限宽,
 * 配色随主题变量自动适应明/暗。
 */
import { useMemo } from "react";
import { renderMarkdown } from "../lib/render";

interface Props {
  content: string;
  hasNote: boolean;
  onFollow: (target: string) => void;
}

export function ReadingView({ content, hasNote, onFollow }: Props) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">从左侧选择一篇笔记,或新建一篇开始。</p>
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
