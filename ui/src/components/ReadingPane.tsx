/**
 * ReadingPane —— 只读 Markdown 阅读侧(B-ED-READING 并排右栏)。
 *
 * renderMarkdown → sanitize → rewrite 相对 img src → 注入 DOM。
 * wikilink 点击委托 onFollow(与设计稿 F-READING 一致)。
 */
import { useEffect, useMemo, useRef } from "react";
import { rewriteHtmlImageSrcs } from "../lib/attachments";
import { ipc } from "../lib/ipc";
import { renderMarkdown, sanitize } from "../lib/render";
import type { TFunc } from "../lib/i18n";

interface Props {
  content: string;
  root: string | null;
  onFollow: (target: string) => void;
  t: TFunc;
  /** 无笔记时显示空态。 */
  hasNote: boolean;
}

export function ReadingPane({ content, root, onFollow, t, hasNote }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onFollowRef = useRef(onFollow);
  onFollowRef.current = onFollow;

  const html = useMemo(() => {
    if (!hasNote) return "";
    const raw = sanitize(renderMarkdown(content));
    if (!root) return raw;
    return rewriteHtmlImageSrcs(raw, (rel) => ipc.resolveMediaUrl(root, rel));
  }, [content, root, hasNote]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.(
        "a.wikilink",
      ) as HTMLElement | null;
      if (!a) return;
      e.preventDefault();
      const target = a.getAttribute("data-target");
      if (target) onFollowRef.current(target);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  if (!hasNote) {
    return (
      <div
        data-testid="reading-pane"
        className="flex h-full items-center justify-center bg-base text-[13px] text-overlay"
      >
        {t("empty.selectOrCreate")}
      </div>
    );
  }

  return (
    <div
      data-testid="reading-pane"
      className="h-full overflow-auto bg-base px-6 py-4"
    >
      <div
        ref={hostRef}
        className="rendered note-content mx-auto max-w-3xl"
        // 已 sanitize + img 改写;wikilink 走委托。
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
