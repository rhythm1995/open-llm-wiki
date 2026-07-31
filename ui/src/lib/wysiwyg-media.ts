/**
 * wysiwyg-media —— WYSIWYG 插图计划(纯逻辑,TDD)。
 * 粘贴/拖入图片 → 附件路径 + Markdown 片段;插入由视图层执行。
 */
import {
  DEFAULT_ATTACHMENTS_DIR,
  ensureImageExt,
  markdownImageSnippet,
  uniqueAttachmentPath,
} from "./attachments";

export interface ImageInsertPlan {
  relPath: string;
  snippet: string;
  alt: string;
}

/**
 * 为一张图片文件计算 vault 相对路径与 md 插入片段。
 */
export function planImageInsert(
  fileName: string,
  mime: string | undefined,
  attachmentsDir: string = DEFAULT_ATTACHMENTS_DIR,
  exists: (rel: string) => boolean = () => false,
  stamp: number = Date.now(),
): ImageInsertPlan {
  const base = ensureImageExt(fileName || "image", mime);
  const relPath = uniqueAttachmentPath(attachmentsDir, base, exists, stamp);
  const alt = base.replace(/\.[^.]+$/, "") || "image";
  return {
    relPath,
    snippet: markdownImageSnippet(relPath, alt),
    alt,
  };
}

/** 多张图片 → 连续 snippet(换行分隔)。 */
export function planImagesInsert(
  files: { name: string; type?: string }[],
  attachmentsDir: string = DEFAULT_ATTACHMENTS_DIR,
  exists: (rel: string) => boolean = () => false,
  stamp: number = Date.now(),
): ImageInsertPlan[] {
  const taken = new Set<string>();
  const check = (r: string) => exists(r) || taken.has(r);
  const out: ImageInsertPlan[] = [];
  files.forEach((f, i) => {
    const p = planImageInsert(
      f.name,
      f.type,
      attachmentsDir,
      check,
      stamp + i,
    );
    taken.add(p.relPath);
    out.push(p);
  });
  return out;
}
