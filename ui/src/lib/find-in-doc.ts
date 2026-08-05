/**
 * find-in-doc —— 当前笔记内查找的纯逻辑(可测)。
 *
 * 对标编辑器查找的产品心智:在整篇文档文本上找全部匹配,
 * 返回 from/to 与循环 next 索引。不依赖 DOM / CodeMirror。
 */

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindResult {
  matches: FindMatch[];
}

/** 转义正则特殊字符(字面量搜索)。 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 在 documentText 中查找全部匹配(大小写不敏感字面量)。
 * 空 query → 无匹配。
 */
export function findInDocument(
  documentText: string,
  query: string,
  caseSensitive = false,
): FindResult {
  const q = query;
  if (!q) return { matches: [] };
  const flags = caseSensitive ? "g" : "gi";
  let re: RegExp;
  try {
    re = new RegExp(escapeRegExp(q), flags);
  } catch {
    return { matches: [] };
  }
  const matches: FindMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(documentText)) !== null) {
    if (m[0].length === 0) {
      // 避免零宽死循环
      re.lastIndex += 1;
      continue;
    }
    matches.push({ from: m.index, to: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return { matches };
}

export function clampFindIndex(index: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  return Math.min(Math.max(index, 0), matchCount - 1);
}

/** 循环到下一个/上一个匹配下标。 */
export function nextFindIndex(
  index: number,
  matchCount: number,
  direction: 1 | -1,
): number {
  if (matchCount <= 0) return 0;
  return (clampFindIndex(index, matchCount) + direction + matchCount) % matchCount;
}

/** 字符偏移 → 1-based 行号(按 \\n 分割)。 */
export function offsetToLine(documentText: string, offset: number): number {
  const o = Math.max(0, Math.min(offset, documentText.length));
  let line = 1;
  for (let i = 0; i < o; i++) {
    if (documentText.charCodeAt(i) === 10) line++;
  }
  return line;
}

export interface ReplaceAllResult {
  text: string;
  /** 实际替换次数。 */
  count: number;
}

/**
 * 全文字面量替换(与 findInDocument 同语义:默认不区分大小写)。
 * 自后向前替换,偏移不漂移。
 */
export function replaceAllInDocument(
  documentText: string,
  query: string,
  replacement: string,
  caseSensitive = false,
): ReplaceAllResult {
  const { matches } = findInDocument(documentText, query, caseSensitive);
  if (matches.length === 0) return { text: documentText, count: 0 };
  let text = documentText;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    text = text.slice(0, m.from) + replacement + text.slice(m.to);
  }
  return { text, count: matches.length };
}

/**
 * 替换从 `fromOffset` 起的第一处匹配(含该偏移上的匹配)。
 * 无匹配 → count 0,text 不变。
 */
export function replaceNextInDocument(
  documentText: string,
  query: string,
  replacement: string,
  fromOffset = 0,
  caseSensitive = false,
): ReplaceAllResult & { match: FindMatch | null } {
  const { matches } = findInDocument(documentText, query, caseSensitive);
  const m =
    matches.find((x) => x.from >= fromOffset) ??
    matches[0] ??
    null;
  if (!m) return { text: documentText, count: 0, match: null };
  const text =
    documentText.slice(0, m.from) + replacement + documentText.slice(m.to);
  return { text, count: 1, match: m };
}
