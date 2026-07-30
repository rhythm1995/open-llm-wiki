/**
 * wysiwyg-qql —— 从笔记全文提取 qql 围栏并准备求值载荷(纯逻辑)。
 * 渲染结果 HTML 复用 qql-block.resultToHtml。
 */
import { findQqlBlocks, resultToHtml, type QqlBlock } from "./qql-block";
import { splitFrontmatter } from "./frontmatter";
import type { ResultSet } from "./ipc";

export interface WysiwygQqlJob {
  index: number;
  query: string;
  /** 展示用:截断后的 query 预览。 */
  preview: string;
}

/** 从完整 .md(可含 fm)提取待求值 qql 任务。 */
export function collectWysiwygQqlJobs(fullMarkdown: string): WysiwygQqlJob[] {
  const { body } = splitFrontmatter(fullMarkdown);
  const blocks: QqlBlock[] = findQqlBlocks(body);
  return blocks.map((b, index) => ({
    index,
    query: b.query,
    preview: b.query.length > 80 ? `${b.query.slice(0, 77)}…` : b.query,
  }));
}

export type WysiwygQqlStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; html: string }
  | { kind: "error"; message: string };

/** ResultSet 或 error 对象 → 状态。 */
export function resultSetToStatus(
  res: ResultSet | { error: string },
): WysiwygQqlStatus {
  if (res && typeof res === "object" && "error" in res) {
    return { kind: "error", message: String((res as { error: string }).error) };
  }
  return { kind: "ok", html: resultToHtml(res as ResultSet) };
}
