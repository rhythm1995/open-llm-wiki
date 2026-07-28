/**
 * render —— 阅读视图(F-READING)的 markdown 渲染(无 DOM)。
 *
 * 用 marked 把正文渲染成 HTML;渲染前先把 `[[wikilink]]` 预处理成带
 * `data-target` 的 `<a class="wikilink">`(marked 透传内联 raw HTML),并去掉
 * frontmatter 围栏。点击事件由 ReadingView 做委托代理(.closest(".wikilink")
 * → onFollow(data-target))。
 *
 * 安全:渲染的是用户自己 vault 里的文件;dangerouslySetInnerHTML 仅用于本地
 * 预览,与 Obsidian 渲染用户内容同性质。后续如需更严格,可加 DOMPurify。
 */
import { marked } from "marked";

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

/** 把正文里的 `[[…]]` 转成 `<a class="wikilink" data-target="T">显示</a>`。 */
export function wikilinkToHtml(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_whole, inner: string) => {
    const { target, display } = splitLink(inner);
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return `<a class="wikilink" data-target="${esc(target)}">${esc(display)}</a>`;
  });
}

/** 渲染整篇笔记:去 frontmatter → wikilink 预处理 → marked → HTML 字符串。 */
export function renderMarkdown(md: string): string {
  const body = stripFrontmatter(md);
  return marked.parse(wikilinkToHtml(body), { async: false }) as string;
}
