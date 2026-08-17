/**
 * wysiwyg-media —— WYSIWYG 插图计划(纯逻辑,TDD)。
 * 粘贴/拖入/BlockNote uploadFile → 附件路径 + Markdown 片段;插入由视图层执行。
 */
import {
  allocateAttachmentPath,
  DEFAULT_ATTACHMENT_LAYOUT,
  DEFAULT_ATTACHMENTS_DIR,
  ensureImageExt,
  isVaultRelativeImageSrc,
  markdownImageSnippet,
  type AttachmentLayout,
} from "./attachments";

export interface ImageInsertPlan {
  relPath: string;
  snippet: string;
  alt: string;
}

export interface ImageInsertOpts {
  attachmentsDir?: string;
  layout?: AttachmentLayout;
  notePath?: string | null;
  stamp?: number;
}

export type AttachmentExistsFn = (
  rel: string,
) => boolean | Promise<boolean>;

/**
 * 异步分配路径(桌面 attachment_exists / mock 均可)。
 * 多张图串行分配并占用 in-flight 集合,避免同毫秒撞名。
 */
export async function planImageInsertAsync(
  fileName: string,
  mime: string | undefined,
  opts: ImageInsertOpts & { exists: AttachmentExistsFn },
): Promise<ImageInsertPlan> {
  const base = ensureImageExt(fileName || "image", mime);
  const relPath = await allocateAttachmentPath(
    opts.attachmentsDir ?? DEFAULT_ATTACHMENTS_DIR,
    base,
    opts.exists,
    opts.stamp ?? Date.now(),
    {
      layout: opts.layout ?? DEFAULT_ATTACHMENT_LAYOUT,
      notePath: opts.notePath,
    },
  );
  const alt = base.replace(/\.[^.]+$/, "") || "image";
  return {
    relPath,
    snippet: markdownImageSnippet(relPath, alt),
    alt,
  };
}

export async function planImagesInsertAsync(
  files: { name: string; type?: string }[],
  opts: ImageInsertOpts & { exists: AttachmentExistsFn },
): Promise<ImageInsertPlan[]> {
  const taken = new Set<string>();
  const check: AttachmentExistsFn = async (r) => {
    if (taken.has(r)) return true;
    return Promise.resolve(opts.exists(r));
  };
  const out: ImageInsertPlan[] = [];
  const baseStamp = opts.stamp ?? Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const p = await planImageInsertAsync(f.name, f.type, {
      attachmentsDir: opts.attachmentsDir,
      layout: opts.layout,
      notePath: opts.notePath,
      exists: check,
      stamp: baseStamp + i * 1000,
    });
    taken.add(p.relPath);
    out.push(p);
  }
  return out;
}

/**
 * BlockNote `uploadFile` 应返回的 src:vault 相对路径(非 data URL)。
 * 与源码模式 `![alt](attachments/…)` 同一真相源。
 */
export function blockNoteUploadSrc(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * BlockNote `resolveFileUrl`:相对附件 → 需要 resolveMediaUrl;
 * 已是协议 URL(http/data/blob/asset/…) → 原样。
 */
export function shouldResolveVaultMediaUrl(url: string): boolean {
  const s = (url ?? "").trim();
  if (!s) return false;
  return isVaultRelativeImageSrc(s);
}
