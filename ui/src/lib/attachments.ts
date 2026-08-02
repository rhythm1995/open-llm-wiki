/**
 * attachments —— 附件路径 / Markdown 插入片段 / 媒体引用索引(纯逻辑,B-ED-MEDIA v1.5)。
 *
 * 约定:
 * - 附件是 vault 内普通文件(不进笔记 live index)。
 * - 插入语法:`![alt](relPath)`(相对 vault 根,稳定于笔记改名)。
 * - 落盘路径可按布局策略分桶(flat / 按日 / 按笔记 / 与笔记同目录)。
 * - 工程:落盘走 IPC;本模块只算路径、md 片段与引用图。
 */

export const DEFAULT_ATTACHMENTS_DIR = "attachments";
export const ATTACHMENTS_DIR_KEY = "openobs.attachmentsDir";
export const ATTACHMENT_LAYOUT_KEY = "openobs.attachmentLayout";

/**
 * 附件落盘布局:
 * - `folder`      — `{dir}/{stamp}-{file}`(扁平,兼容旧行为)
 * - `folder-date` — `{dir}/YYYY-MM-DD/{stamp}-{file}`(按日分桶)
 * - `folder-note` — `{dir}/{noteStem}/{stamp}-{file}`(按笔记分桶,默认)
 * - `note-folder` — 与当前笔记同目录(无笔记路径时回退 folder)
 */
export type AttachmentLayout =
  | "folder"
  | "folder-date"
  | "folder-note"
  | "note-folder";

export const DEFAULT_ATTACHMENT_LAYOUT: AttachmentLayout = "folder-note";

export function normalizeAttachmentLayout(
  raw: string | null | undefined,
): AttachmentLayout {
  if (
    raw === "folder" ||
    raw === "folder-date" ||
    raw === "folder-note" ||
    raw === "note-folder"
  ) {
    return raw;
  }
  return DEFAULT_ATTACHMENT_LAYOUT;
}

/** 消毒目录段:禁止 `..`、绝对路径、空。 */
export function normalizeAttachmentsDir(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return DEFAULT_ATTACHMENTS_DIR;
  let s = String(raw).trim().replace(/\\/g, "/");
  s = s.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = s.split("/").filter((p) => p && p !== "." && p !== "..");
  if (parts.length === 0) return DEFAULT_ATTACHMENTS_DIR;
  return parts.join("/");
}

/**
 * 文件名消毒:去路径分隔与 OS 非法字符,保留 Unicode 字母(中文笔记名可用)。
 * 空白 → `-`;去掉控制字符与 `<>:"|?*`。
 */
export function sanitizeAttachmentBasename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "image";
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]+/g, "_")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .replace(/\.+$/, (m) => (m.length && base.includes(".") ? m : ""))
    .trim();
  // 纯点/空 → 回退
  if (!cleaned || /^\.+$/.test(cleaned)) return "image";
  return cleaned;
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

/** 本地时间前缀 `YYYYMMDD-HHmmss`,便于 Finder 排序与人工辨认(替代裸 epoch ms)。 */
export function formatAttachmentStamp(stampMs: number = Date.now()): string {
  const d = new Date(stampMs);
  if (Number.isNaN(d.getTime())) return String(stampMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 笔记路径 → 消毒后的 stem(无扩展名),用于 folder-note 分桶。 */
export function noteStemFromPath(notePath: string | null | undefined): string {
  if (notePath == null || !String(notePath).trim()) return "";
  const base = String(notePath).replace(/\\/g, "/").split("/").pop() ?? "";
  const stem = base.replace(/\.md$/i, "").trim();
  if (!stem) return "";
  return sanitizeAttachmentBasename(stem) || "note";
}

/** 笔记所在目录(相对 vault 根);根级笔记 → `""`。 */
export function noteDirFromPath(notePath: string | null | undefined): string {
  if (notePath == null || !String(notePath).trim()) return "";
  const n = String(notePath).replace(/\\/g, "/").replace(/^\/+/, "");
  const i = n.lastIndexOf("/");
  if (i <= 0) return "";
  return n.slice(0, i);
}

/**
 * 根据布局策略计算附件目标目录(相对 vault 根,不含文件名)。
 * `note-folder` 且无 notePath 时回退到 attachmentsDir。
 */
export function attachmentTargetDir(
  attachmentsDir: string,
  layout: AttachmentLayout = DEFAULT_ATTACHMENT_LAYOUT,
  notePath?: string | null,
  stampMs: number = Date.now(),
): string {
  const dir = normalizeAttachmentsDir(attachmentsDir);
  switch (layout) {
    case "folder":
      return dir;
    case "folder-date": {
      const d = new Date(stampMs);
      const p = (n: number) => String(n).padStart(2, "0");
      const day = Number.isNaN(d.getTime())
        ? "unknown"
        : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return `${dir}/${day}`;
    }
    case "folder-note": {
      const stem = noteStemFromPath(notePath);
      return stem ? `${dir}/${stem}` : dir;
    }
    case "note-folder": {
      if (notePath == null || !String(notePath).trim()) return dir;
      return noteDirFromPath(notePath);
    }
    default:
      return dir;
  }
}

export interface UniqueAttachmentOpts {
  layout?: AttachmentLayout;
  notePath?: string | null;
}

/**
 * 生成唯一相对路径:`{targetDir}/{YYYYMMDD-HHmmss}-{base}`。
 * `exists` 返回 true 表示已被占用(同步;桌面请用 allocateAttachmentPath + IPC)。
 */
export function uniqueAttachmentPath(
  dir: string,
  basename: string,
  exists: (rel: string) => boolean,
  stamp: number = Date.now(),
  opts: UniqueAttachmentOpts = {},
): string {
  const layout = opts.layout ?? "folder";
  const target = attachmentTargetDir(dir, layout, opts.notePath, stamp);
  const prefix = formatAttachmentStamp(stamp);
  const base = ensureImageExt(basename);
  const join = (name: string) => (target ? `${target}/${name}` : name);
  let path = join(`${prefix}-${base}`);
  let i = 1;
  while (exists(path)) {
    path = join(`${prefix}-${i}-${base}`);
    i++;
  }
  return path;
}

/**
 * 异步分配唯一路径(exists 可为 Promise)。桌面端应对接 attachment_exists。
 */
export async function allocateAttachmentPath(
  dir: string,
  basename: string,
  exists: (rel: string) => boolean | Promise<boolean>,
  stamp: number = Date.now(),
  opts: UniqueAttachmentOpts = {},
): Promise<string> {
  const layout = opts.layout ?? "folder";
  const target = attachmentTargetDir(dir, layout, opts.notePath, stamp);
  const prefix = formatAttachmentStamp(stamp);
  const base = ensureImageExt(basename);
  const join = (name: string) => (target ? `${target}/${name}` : name);
  let path = join(`${prefix}-${base}`);
  let i = 1;
  while (await Promise.resolve(exists(path))) {
    path = join(`${prefix}-${i}-${base}`);
    i++;
    if (i > 10_000) {
      throw new Error("attachment path collision: too many retries");
    }
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
 * 从 Markdown 抽出 vault 相对图片路径(`![alt](path)`)。
 * 忽略 http(s)/data/blob 等外链;规范化 `/` 与去 `./` 前缀。
 */
export function extractMarkdownImagePaths(md: string): string[] {
  if (!md) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // ![alt](path) or ![alt](path "title")
  const re = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (!raw || !isVaultRelativeImageSrc(raw)) continue;
    const norm = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** 构建「附件路径 → 引用它的笔记路径列表」。 */
export function buildMediaRefIndex(
  notes: Iterable<{ path: string; body: string }>,
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const n of notes) {
    const refs = extractMarkdownImagePaths(n.body);
    for (const media of refs) {
      const list = index.get(media);
      if (list) {
        if (!list.includes(n.path)) list.push(n.path);
      } else {
        index.set(media, [n.path]);
      }
    }
  }
  return index;
}

/**
 * 磁盘上的附件里,没有任何笔记引用的路径(孤儿)。
 * `filesOnDisk` / 引用路径均应为 vault 相对、`/` 分隔。
 */
export function findOrphanAttachments(
  filesOnDisk: Iterable<string>,
  referenced: Iterable<string> | Map<string, unknown>,
): string[] {
  const refSet =
    referenced instanceof Map
      ? new Set(referenced.keys())
      : new Set(
          [...referenced].map((p) =>
            p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, ""),
          ),
        );
  const orphans: string[] = [];
  for (const f of filesOnDisk) {
    const norm = f.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    if (!norm) continue;
    if (!refSet.has(norm)) orphans.push(norm);
  }
  orphans.sort();
  return orphans;
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
