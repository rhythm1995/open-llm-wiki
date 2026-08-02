/**
 * ReadingPane —— 只读 Markdown 阅读侧(B-ED-READING 并排右栏)。
 *
 * sheet 围栏 → 表格预览;renderMarkdown → sanitize → 改写 img。
 * wikilink 点击委托 onFollow。
 */
import { useEffect, useRef, useState } from "react";
import { rewriteHtmlImageSrcs } from "../lib/attachments";
import { ipc } from "../lib/ipc";
import { renderMarkdown, sanitize } from "../lib/render";
import { rewriteMarkdownSheetBlocks } from "../lib/sheet-block";
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
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!hasNote) {
      setHtml("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const withSheets = await rewriteMarkdownSheetBlocks(
        content,
        async (path) => {
          if (!root) return null;
          try {
            return await ipc.readNote(root, path);
          } catch {
            return null;
          }
        },
      );
      // wiki 短名 `![[shot.png]]` 依赖媒体文件列表。
      let mediaFiles: string[] = [];
      if (root) {
        try {
          const snap = await ipc.mediaIndex(root, false);
          mediaFiles = snap.files ?? [];
        } catch {
          mediaFiles = [];
        }
      }
      let raw = sanitize(renderMarkdown(withSheets, { mediaFiles }));
      if (root) {
        raw = rewriteHtmlImageSrcs(raw, (rel) =>
          ipc.resolveMediaUrl(root, rel),
        );
      }
      if (!cancelled) setHtml(raw);
    })();
    return () => {
      cancelled = true;
    };
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
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
