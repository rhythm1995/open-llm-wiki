/**
 * text-stats —— 纯文本统计(F-打磨)。
 *
 * 给 StatusBar 用:字符数 / 行数 / 词数。纯逻辑、无 IO,可 node 单测。
 *
 * 词数用 unicode 感知的"连续字母/数字段"计数(`/[\p{L}\p{N}]+/gu`),对中英混排合理:
 * 中文按"连续汉字串"算一个词(不做分词),英文按空白/标点切。这不是严格意义上的"词数",
 * 而是一个稳定、可复现的近似指标——StatusBar 只需要一个粗略提示,不需要分词器。
 *
 * 行数约定:空串为 0 行;否则按 `\n` 切(末尾无换行也计一行,与多数编辑器一致)。
 */
export interface TextStats {
  chars: number;
  lines: number;
  words: number;
}

export function countText(input: string): TextStats {
  const chars = input.length;
  const lines = input.length === 0 ? 0 : input.split("\n").length;
  const matches = input.match(/[\p{L}\p{N}]+/gu);
  const words = matches ? matches.length : 0;
  return { chars, lines, words };
}
