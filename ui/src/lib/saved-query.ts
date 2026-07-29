/**
 * saved-query —— 把常用 QQL 存成笔记,自举进图谱(F-打磨)。
 *
 * 一个 saved query 就是一篇 `type: Query` 的普通笔记:frontmatter 声明软类型,
 * 正文是一个 ```qql 代码块(真相)。这样它自动进索引/图谱/检索,可被 `[[]]`
 * 链接、可被别的 QQL 查到——自举。qql 文本只在"重跑"时做一次 readNote 抠出;
 * 列表用 snapshot 的 title 即可,无需 N 次读盘。
 *
 * 纯逻辑(无 IO、无 React),可 node 单测。
 */
import type { NodeOut } from "./ipc";
import { setFrontmatterValue } from "./frontmatter";

/** saved query 的软类型常量。 */
export const QUERY_TYPE = "Query";

/** saved query 笔记的统一目录前缀(便于归类;非强制)。 */
const QUERY_DIR = "queries";

/** 各 OS 文件名非法字符 + 路径分隔符,统一替换为连字符;空名 / 仅标点 → "query"。 */
export function sanitizeQueryName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  // 只剩标点/连字符、无任何字母数字 → 无意义,回退。
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return "query";
  return cleaned;
}

/** saved query 笔记的相对路径:`queries/<sanitized name>.md`。 */
export function queryNotePath(name: string): string {
  return `${QUERY_DIR}/${sanitizeQueryName(name)}.md`;
}

/**
 * 组装一篇 saved query 笔记:frontmatter `type: Query` + H1 标题(sanitized 名)
 * + ```qql 块(qql 去首尾空白)。软类型用 frontmatter.ts 写,与 core 解析对齐。
 */
export function buildQueryNote(name: string, qql: string): string {
  const title = sanitizeQueryName(name);
  // setFrontmatterValue("", "type", ...) 产出 "---\ntype: Query\n---\n";接正文。
  const head = setFrontmatterValue("", "type", QUERY_TYPE);
  return `${head}\n# ${title}\n\n\`\`\`qql\n${qql.trim()}\n\`\`\`\n`;
}

/**
 * 从笔记正文抠出首个 ```qql 块的文本(去首尾空白);无 qql 块 → null。
 * 只看正文,供"重跑"用(是否真的是 Query 软类型由 node.type 判断)。
 */
export function extractQueryFromNote(content: string): string | null {
  const m = /```qql[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(content);
  return m ? m[1].trim() : null;
}

/** 该节点是否为一篇 saved query(按软类型 Query)。 */
export function isQueryNode(node: NodeOut): boolean {
  return node.type === QUERY_TYPE;
}

/**
 * 由 qql 文本推一个默认查询名(去前导关键字,取头几个词),减少保存时命名摩擦。
 */
export function defaultQueryName(qql: string): string {
  const stripped = qql
    .trim()
    .replace(/^(WHERE|RENDER|SORT|SHOW|LIMIT)\s+/i, "");
  const head = stripped.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
  return head || "query";
}
