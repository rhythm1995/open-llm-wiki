/**
 * ai-context —— 把当前笔记 + 其外向链接命中的邻居笔记,拼成一段 LLM 友好的
 * markdown 上下文(F-AI 的"读侧桥接")。
 *
 * 纯逻辑、无 IO:邻居的正文由调用方(store)先用 readNote 取好再传入。这样本函数
 * 可直接单测。完整 MCP server(让 agent 反向读写 vault)是独立工程,见路线图。
 */

/** 一篇笔记的上下文快照(正文含 frontmatter)。 */
export interface AiContextNote {
  path: string;
  title: string;
  content: string;
}

export interface AiContextOptions {
  current: AiContextNote;
  /** 当前笔记外向链接命中的笔记(已解析 + 已取正文),按给定顺序拼接。 */
  neighbors: AiContextNote[];
}

/** Composer `@`-context 选择器的候选项(只含标题/路径,不预取正文)。 */
export interface ContextCandidate {
  path: string;
  title: string;
  /** 是否为当前笔记(当前笔记恒附,不可取消勾选)。 */
  isCurrent: boolean;
}

/**
 * 组装上下文 markdown:先当前笔记(标题/路径/正文),再各邻居(二级标题 + 路径 + 正文)。
 * 无邻居时不输出分隔线与"相关笔记"小节。两端正文做 trim,避免多余空行。
 */
export function buildAiContext({ current, neighbors }: AiContextOptions): string {
  const out: string[] = [];
  out.push("# 当前笔记", "");
  out.push(`标题:${current.title}`);
  out.push(`路径:${current.path}`);
  out.push("");
  out.push(current.content.trim());
  out.push("");
  if (neighbors.length > 0) {
    out.push("---", "");
    // 来源可能是外向链接邻居(复制)或用户勾选的打开标签(@-context),措辞保持中性。
    out.push(`# 相关笔记(共 ${neighbors.length} 篇)`, "");
    for (const n of neighbors) {
      out.push(`## ${n.title}`);
      out.push(`路径:${n.path}`, "");
      out.push(n.content.trim());
      out.push("");
    }
  }
  return `${out.join("\n").trim()}\n`;
}
