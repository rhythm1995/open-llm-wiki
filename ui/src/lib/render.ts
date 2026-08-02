/**
 * render —— 阅读视图(F-READING)的 markdown 渲染。
 *
 * 管线:去 frontmatter → `![[img]]` wiki 嵌入图 → `[[wikilink]]` → marked。
 * 必须先处理 `![[…]]`,否则会被 wikilink 规则误伤成 `!<a…>`。
 *
 * 安全:`renderMarkdown` 产出**未清洗** HTML;注入 DOM 前必须 `sanitize()`。
 */
import DOMPurify from "dompurify";
import { marked } from "marked";
import { isVaultRelativeImageSrc } from "./attachments";

marked.setOptions({ gfm: true, breaks: false });

/** 去掉开头的 frontmatter 围栏(含其后紧随的空行);无则原样返回。 */
export function stripFrontmatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n*/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

function splitLink(inner: string): { target: string; display: string } {
  const [left, alias] = inner.split("|");
  const target = (left ?? "").split("#")[0].trim();
  const display = (alias ?? left ?? "").trim();
  return { target, display };
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isImageTarget(target: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(target.trim());
}

/**
 * 短名 / 相对路径 → vault 媒体路径。
 * `mediaFiles` 为库内已有附件路径列表(来自 media_index.files)。
 */
export function resolveWikiImageTarget(
  target: string,
  mediaFiles: string[] = [],
): string {
  let t = target.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!t) return t;
  const normFiles = mediaFiles.map((p) =>
    p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, ""),
  );
  if (normFiles.includes(t)) return t;
  const base = t.split("/").pop() ?? t;
  const hits = normFiles.filter((p) => (p.split("/").pop() ?? p) === base);
  if (hits.length === 1) return hits[0]!;
  return t;
}

export type RenderMarkdownOpts = {
  /** 用于解析 `![[shot.png]]` 短名;缺省不解析(保留字面路径)。 */
  mediaFiles?: string[];
};

/**
 * `![[path.png]]` / `![[path|alt]]` → `<img class="wiki-embed-img" src="…" data-vault-src="…">`。
 * 非图片扩展名的 `![[Note]]` 降级为 `[[Note]]`(后续走 wikilink,不做全文嵌入)。
 */
export function wikiImageEmbedToHtml(
  md: string,
  mediaFiles: string[] = [],
): string {
  return md.replace(/!\[\[([^\]]+)\]\]/g, (_whole, inner: string) => {
    const { target, display } = splitLink(inner);
    if (!target) return _whole;
    if (!isImageTarget(target)) {
      // 嵌笔记:降级为普通 wikilink 语法
      return `[[${inner}]]`;
    }
    const resolved = resolveWikiImageTarget(target, mediaFiles);
    const alt = display || resolved.split("/").pop() || "image";
    if (!isVaultRelativeImageSrc(resolved) && /:\/\//.test(resolved)) {
      return _whole;
    }
    return `<img class="wiki-embed-img" src="${escAttr(resolved)}" alt="${escAttr(alt)}" data-vault-src="${escAttr(resolved)}" />`;
  });
}

/** 把正文里的 `[[…]]` 转成 `<a class="wikilink" data-target="T">显示</a>`。 */
export function wikilinkToHtml(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_whole, inner: string) => {
    const { target, display } = splitLink(inner);
    return `<a class="wikilink" data-target="${escAttr(target)}">${escAttr(display)}</a>`;
  });
}

/** 渲染整篇笔记:FM → wiki 图嵌入 → wikilink → marked。 */
export function renderMarkdown(
  md: string,
  opts: RenderMarkdownOpts = {},
): string {
  const body = stripFrontmatter(md);
  const withEmbeds = wikiImageEmbedToHtml(body, opts.mediaFiles ?? []);
  return marked.parse(wikilinkToHtml(withEmbeds), { async: false }) as string;
}

/**
 * DOMPurify 清洗 —— 注入 DOM 前的最后一道闸。
 */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: [
      "data-target",
      "data-vault-src",
      "class",
      "viewBox",
      "xmlns",
      "fill",
      "stroke",
      "stroke-width",
      "points",
      "text-anchor",
      "font-size",
      "x",
      "y",
      "width",
      "height",
      "d",
    ],
    ADD_TAGS: ["svg", "rect", "polyline", "text", "g", "path", "circle", "line"],
  }) as string;
}
