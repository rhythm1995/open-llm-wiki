/**
 * md-format —— Markdown 选区格式化纯逻辑(Source 工具条 / 右键,可测)。
 *
 * 输入当前全文 + 选区 [from,to],输出新全文与新选区。不碰 DOM/CM。
 */

export interface TextRange {
  from: number;
  to: number;
}

export interface FormatResult {
  text: string;
  selection: TextRange;
}

/** 用前后缀包裹选区;若已是同一包裹则剥掉(toggle)。 */
export function wrapSelection(
  text: string,
  sel: TextRange,
  before: string,
  after: string = before,
): FormatResult {
  const { from, to } = normalize(sel, text.length);
  const selected = text.slice(from, to);
  // toggle:已包裹则去掉
  if (
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    const next = text.slice(0, from) + inner + text.slice(to);
    return {
      text: next,
      selection: { from, to: from + inner.length },
    };
  }
  const inserted = before + selected + after;
  const next = text.slice(0, from) + inserted + text.slice(to);
  return {
    text: next,
    selection: {
      from: from + before.length,
      to: from + before.length + selected.length,
    },
  };
}

export function toggleBold(text: string, sel: TextRange): FormatResult {
  return wrapSelection(text, sel, "**", "**");
}

export function toggleItalic(text: string, sel: TextRange): FormatResult {
  return wrapSelection(text, sel, "*", "*");
}

export function toggleInlineCode(text: string, sel: TextRange): FormatResult {
  return wrapSelection(text, sel, "`", "`");
}

/** 当前行前加/换 heading 级别(1–6);level=0 去掉 heading。 */
export function setLineHeading(
  text: string,
  sel: TextRange,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): FormatResult {
  const { from } = normalize(sel, text.length);
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  let lineEnd = text.indexOf("\n", from);
  if (lineEnd < 0) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const stripped = line.replace(/^#{1,6}\s+/, "");
  const prefix = level === 0 ? "" : `${"#".repeat(level)} `;
  const newLine = prefix + stripped;
  const next = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  const caret = lineStart + newLine.length;
  return { text: next, selection: { from: caret, to: caret } };
}

/** 当前行 toggle 无序列表 `- `。 */
export function toggleBulletList(text: string, sel: TextRange): FormatResult {
  return toggleLinePrefix(text, sel, "- ");
}

/** 当前行 toggle 引用 `> `。 */
export function toggleBlockQuote(text: string, sel: TextRange): FormatResult {
  return toggleLinePrefix(text, sel, "> ");
}

function toggleLinePrefix(
  text: string,
  sel: TextRange,
  prefix: string,
): FormatResult {
  const { from } = normalize(sel, text.length);
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  let lineEnd = text.indexOf("\n", from);
  if (lineEnd < 0) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  let newLine: string;
  if (line.startsWith(prefix)) {
    newLine = line.slice(prefix.length);
  } else {
    // 去掉已有列表/引用前缀再加
    const stripped = line.replace(/^(?:[-*+]\s+|>\s+|#{1,6}\s+)/, "");
    newLine = prefix + stripped;
  }
  const next = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  const caret = lineStart + newLine.length;
  return { text: next, selection: { from: caret, to: caret } };
}

/** 插入 wikilink 模板;有选区则包成 [[选区]]。 */
export function insertWikilink(text: string, sel: TextRange): FormatResult {
  const { from, to } = normalize(sel, text.length);
  const selected = text.slice(from, to);
  if (selected) {
    return wrapSelection(text, sel, "[[", "]]");
  }
  const stub = "[[]]";
  const next = text.slice(0, from) + stub + text.slice(to);
  // 光标放在 [[|]]
  return {
    text: next,
    selection: { from: from + 2, to: from + 2 },
  };
}

function normalize(sel: TextRange, len: number): TextRange {
  let from = Math.max(0, Math.min(sel.from, len));
  let to = Math.max(0, Math.min(sel.to, len));
  if (from > to) [from, to] = [to, from];
  return { from, to };
}
