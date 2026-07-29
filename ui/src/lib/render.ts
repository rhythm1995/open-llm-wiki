/**
 * render —— 阅读视图(F-READING)的 markdown 渲染。
 *
 * 用 marked 把正文渲染成 HTML;渲染前先把 `[[wikilink]]` 预处理成带
 * `data-target` 的 `<a class="wikilink">`(marked 透传内联 raw HTML),并去掉
 * frontmatter 围栏。点击事件由 ReadingView 做委托代理(.closest(".wikilink")
 * → onFollow(data-target))。
 *
 * 安全:`renderMarkdown` 产出的是**未清洗**的 marked HTML(供测试与可能的聚合渲染
 * 复用);真正注入 DOM 前必须经 `sanitize()` 走 DOMPurify——剥离 `<script>`、
 * 内联事件处理器(onerror/onclick…)等,同时把点击委托依赖的 `data-target` 与
 * `class` 显式加入白名单。即使用户 vault 里混入了他人的 md,也不会执行任意脚本。
 * `sanitize` 需要 `window`(浏览器或 jsdom 测试环境);`renderMarkdown` 自身保持
 * 无 DOM,故可在 node 环境单测。
 */
import DOMPurify from "dompurify";
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

/** 渲染整篇笔记:去 frontmatter → wikilink 预处理 → marked → HTML 字符串。
 *  注意:返回的是**未清洗**的 HTML;注入 DOM 前请用 `sanitize()`。 */
export function renderMarkdown(md: string): string {
  const body = stripFrontmatter(md);
  return marked.parse(wikilinkToHtml(body), { async: false }) as string;
}

/**
 * DOMPurify 清洗 —— 注入 DOM 前的最后一道闸。
 *
 * 默认配置已剥离 `<script>`、内联 `on*` 事件处理器、`javascript:` 链接等;这里额外
 * 把 wikilink 点击委托所依赖的 `data-target` 与 `class` 显式纳入白名单,使
 * `<a class="wikilink" data-target="…">` 在清洗后结构不变、点击仍能跟随。
 * 需要 `window`(浏览器 / jsdom)。
 */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-target", "class"],
  }) as string;
}
