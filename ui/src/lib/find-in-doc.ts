/**
 * find-in-doc —— 当前笔记内查找的纯逻辑(可测)。
 *
 * 对标 Tolaria editorFind 的产品心智:在整篇文档文本上找全部匹配,
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
