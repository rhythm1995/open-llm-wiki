/**
 * attachments —— 附件路径 / Markdown 插入片段(纯逻辑,B-ED-MEDIA v1)。
 *
 * 约定:默认目录 `attachments/`;语法 `![alt](relPath)`(相对 vault 根)。
 * 工程:落盘走 IPC;本模块只算路径与 md。
 */
export const DEFAULT_ATTACHMENTS_DIR = "attachments";
export const ATTACHMENTS_DIR_KEY = "openobs.attachmentsDir";

/** 消毒目录段:禁止 `..`、绝对路径、空。 */
export function normalizeAttachmentsDir(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return DEFAULT_ATTACHMENTS_DIR;
  let s = String(raw).trim().replace(/\\/g, "/");
  s = s.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = s.split("/").filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) return DEFAULT_ATTACHMENTS_DIR;
  return parts.join("/");
}

/** 文件名消毒:去路径分隔与危险字符。 */
export function sanitizeAttachmentBasename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "image";
  const cleaned = base.replace(/[^\w.\-()+@ ]+/g, "_").replace(/\s+/g, "-");
  return cleaned || "image";
}

/** 保证扩展名(默认 .png)。 */
export function ensureImageExt(name: string, mime?: string): string {
  const n = sanitizeAttachmentBasename(name);
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n)) return n;
  const fromMime: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  const ext = (mime && fromMime[mime]) || ".png";
  return n + ext;
}

/**
 * 生成唯一相对路径:`{dir}/{stamp}-{base}`。
 * `exists` 返回 true 表示已被占用。
 */
export function uniqueAttachmentPath(
  dir: string,
  basename: string,
  exists: (rel: string) => boolean,
  stamp: number = Date.now(),
): string {
  const d = normalizeAttachmentsDir(dir);
  const base = ensureImageExt(basename);
  let path = `${d}/${stamp}-${base}`;
  let i = 1;
  while (exists(path)) {
    path = `${d}/${stamp}-${i}-${base}`;
    i++;
  }
  return path;
}

/** 插入用 Markdown 图片语法。 */
export function markdownImageSnippet(
  relPath: string,
  alt: string = "",
): string {
  const src = relPath.replace(/\\/g, "/");
  const a = (alt || src.split("/").pop() || "image").replace(/[[\]]/g, "");
  return `![${a}](${src})`;
}

/** 判断路径是否像 vault 内相对图片(非 http(s)/data/绝对)。 */
export function isVaultRelativeImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  if (/^(https?:|data:|blob:|asset:|tauri:|file:)/i.test(s)) return false;
  if (s.startsWith("//")) return false;
  return /\.(png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i.test(s) || !s.includes("://");
}

/**
 * 把 HTML 里相对路径的 <img src> 改写为 resolve(src) 返回的 URL。
 * 已是绝对/协议 URL 的不动。
 */
export function rewriteHtmlImageSrcs(
  html: string,
  resolve: (relSrc: string) => string,
): string {
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (full, pre: string, q: string, src: string) => {
      if (!isVaultRelativeImageSrc(src)) return full;
      const url = resolve(src);
      return `${pre}${q}${url}${q}`;
    },
  );
}

export type EditorLayoutMode = "edit" | "split";
export const EDITOR_LAYOUT_KEY = "openobs.editorLayout";

export function normalizeEditorLayout(
  raw: string | null | undefined,
): EditorLayoutMode {
  return raw === "split" ? "split" : "edit";
}

/** Blob/File → data URL(供 save_attachment / mock 预览)。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("FileReader failed"));
    r.readAsDataURL(blob);
  });
}

/** 是否像可粘贴/拖入的图片文件。 */
export function isImageFile(file: File | Blob & { type?: string; name?: string }): boolean {
  const t = file.type || "";
  if (t.startsWith("image/")) return true;
  const name = "name" in file && typeof file.name === "string" ? file.name : "";
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

/**
 * 从 ClipboardEvent / DataTransfer 收集图片 File。
 * paste 优先 clipboardData.items;drop 走 files。
 */
export function collectImageFiles(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];
  const out: File[] = [];
  if (data.items && data.items.length > 0) {
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  if (out.length === 0 && data.files && data.files.length > 0) {
    for (let i = 0; i < data.files.length; i++) {
      const f = data.files[i];
      if (isImageFile(f)) out.push(f);
    }
  }
  return out;
}
