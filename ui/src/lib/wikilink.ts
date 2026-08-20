/**
 * wikilink.ts —— `[[link]]` 的解析与跳转解析(纯逻辑,F-WIKILINK 的"跳转"核心)。
 *
 * 客户端按快照节点解析 `[[target]]` 到一条 vault 路径,供编辑器 Cmd/Ctrl+点击跟随。
 * 三级回退(对齐 core::graph,但 NodeOut 不含 aliases,故省略 alias 级):
 *   标题(大小写不敏感)→ 完整路径 stem → 裸文件名 stem(跨目录)
 * 标题优先,避免歧义时取更具体的命中。
 *
 * ⚠️ aliases 解析在客户端暂不支持(NodeOut 未暴露 aliases);真机语义仍以 core 为准。
 */
import type { NodeOut } from "./ipc";

export interface ParsedLink {
  target: string;
  anchor: string | null;
}

/** 拆 `[[target|alias#anchor]]` 的内层:取 target、去 alias、留 anchor。 */
export function parseLinkInner(inner: string): ParsedLink {
  const targetPart = inner.split("|")[0];
  const [target, anchor] = targetPart.split("#");
  const t = target.trim();
  return { target: t, anchor: anchor ? anchor.trim() : null };
}

/** 光标列落在哪一段 `[[…]]` 上就返回其 target;否则 null。源码 ⌘-点击用。 */
export function wikilinkTargetAtColumn(lineText: string, col: number): string | null {
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    if (col >= m.index && col <= m.index + m[0].length) {
      return parseLinkInner(m[1]).target;
    }
  }
  return null;
}

/** 路径去扩展名(仅当扩展名在文件名段才剥),保留目录。 */
function pathStem(path: string): string {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot > slash && dot !== -1) return path.slice(0, dot);
  return path;
}

/** 裸文件名 stem:最后一段去扩展名。 */
function fileStem(path: string): string {
  const slash = path.lastIndexOf("/");
  const last = slash === -1 ? path : path.slice(slash + 1);
  const dot = last.lastIndexOf(".");
  return dot === -1 ? last : last.slice(0, dot);
}

/**
 * 把关系 chip 的 raw target 解析成展示标题。
 * 复用 resolveWikiTarget 的 title → pathStem → fileStem 三级回退;
 * 命中取 node.title,未命中回退 target 原串。
 */
export function resolveTitleForTarget(target: string, nodes: NodeOut[]): string {
  const path = resolveWikiTarget(target, nodes);
  if (!path) return target;
  const node = nodes.find((n) => n.path === path);
  const title = node?.title.trim();
  return title ? title : target;
}

/** 把 `[[target]]` 解析到 vault 路径;未命中返回 null。 */
export function resolveWikiTarget(target: string, nodes: NodeOut[]): string | null {
  const t = target.trim().toLowerCase();
  if (t === "") return null;

  // 1) 标题
  for (const n of nodes) {
    if (n.title.toLowerCase() === t) return n.path;
  }
  // 2) 完整路径 stem
  for (const n of nodes) {
    if (pathStem(n.path).toLowerCase() === t) return n.path;
  }
  // 3) 裸文件名 stem
  for (const n of nodes) {
    if (fileStem(n.path).toLowerCase() === t) return n.path;
  }
  return null;
}

export interface OpenLinkContext {
  /** 光标前已输入的目标文本(不含 `[[`)。 */
  typed: string;
  /** typed 在传入文本中的起始偏移(即 `[[` 之后的位置)。 */
  innerStart: number;
}

/**
 * 从"光标之前的文本"里判断是否正处于一个未闭合的 `[[` 内。
 * 命中 `[[foo`(允许任意字符到末尾),排除已闭合的 `[[foo]]` 及 alias/anchor 区。
 * 用于编辑器的 `[[` 自动补全:命中即弹候选。
 */
export function openLinkContext(textBeforeCursor: string): OpenLinkContext | null {
  const m = /\[\[([^\]|#]*)$/.exec(textBeforeCursor);
  if (!m) return null;
  return { typed: m[1], innerStart: m.index + 2 };
}

/**
 * 按已输入文本过滤标题候选(大小写不敏感子串、去重)。
 * typed 为空返回全部。
 */
export function filterByTitles(titles: string[], typed: string): string[] {
  const t = typed.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const title of titles) {
    if (seen.has(title)) continue;
    if (t === "" || title.toLowerCase().includes(t)) {
      seen.add(title);
      out.push(title);
    }
  }
  return out;
}

/**
 * 把一个节点格式化成可粘贴的 `[[wikilink]]`(图谱右键「复制 wikilink」用)。
 * 优先用标题;空标题、或含 `]` `|` `#`(会破坏链接语法)时回退到文件名 stem。
 * 纯逻辑。
 */
export function nodeWikilink(title: string, path: string): string {
  const file = fileStem(path);
  const trimmed = title.trim();
  const safe = trimmed.length > 0 && !/[\[\]|#]/.test(trimmed);
  return `[[${safe ? trimmed : file}]]`;
}
