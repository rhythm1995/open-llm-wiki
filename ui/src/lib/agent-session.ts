/**
 * agent-session —— 应用内 Agent 会话的纯逻辑 helper(doc 11 / Phase 7)。
 *
 * 两件事:
 *  1. 解析 ACP SessionUpdate 帧(经 spike + crate schema 核实):把流式更新分类成
 *     agent 文本增量 / 工具事件(新建/补丁)/ 噪声。供 ThreadView 折叠渲染与转录归一化共用。
 *  2. Model C 移交归一化(§2.4):把当前线程压成给**新 agent** 的 seed user message。
 *
 * SessionUpdate 在线上是**内部 tag**(`{sessionUpdate:"agent_message_chunk",...}`,
 * spike 实测确认);ToolCall 各字段 camelCase(crate schema:`toolCallId`/`title`/
 * `status`/`content`/`locations`),status 取值 PascalCase(Pending/InProgress/
 * Completed/Failed)。
 */

/** 工具调用状态(归一化为 snake_case 便于 UI 判定)。 */
export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolRecord {
  id: string;
  title: string;
  status: ToolStatus;
  /** 合并后的文本输出(tool_call_content 里 type=text 的项拼接)。 */
  text: string;
  locations: string[];
}

export type ParsedUpdate =
  | { kind: "agent_text"; text: string }
  | { kind: "tool_new"; rec: ToolRecord }
  | { kind: "tool_patch"; id: string; patch: Partial<ToolRecord> }
  | { kind: "usage"; used: number; size: number }
  | { kind: "ignore" };

/** 线上 PascalCase → 内部 snake_case。 */
export function parseStatus(v: unknown): ToolStatus | undefined {
  switch (v) {
    case "Pending":
      return "pending";
    case "InProgress":
      return "in_progress";
    case "Completed":
      return "completed";
    case "Failed":
      return "failed";
    default:
      return undefined;
  }
}

/** ToolCallContent[] 里 type=text 的文本拼接(其余如 file_diff 忽略,§5 二级折叠另展)。 */
export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c: any) =>
      c && c.type === "text" && typeof c.text === "string" ? c.text : "",
    )
    .filter(Boolean)
    .join("\n");
}

export function extractLocations(locs: unknown): string[] {
  if (!Array.isArray(locs)) return [];
  return locs
    .map((l: any) => (l && typeof l.path === "string" ? l.path : ""))
    .filter(Boolean);
}

/** 把一帧 SessionUpdate 分类。 */
export function parseSessionUpdate(update: unknown): ParsedUpdate {
  if (!update || typeof update !== "object") return { kind: "ignore" };
  const u = update as Record<string, any>;
  const tag = u.sessionUpdate;

  if (tag === "agent_message_chunk" && u.content?.type === "text") {
    return typeof u.content.text === "string"
      ? { kind: "agent_text", text: u.content.text }
      : { kind: "ignore" };
  }
  // 非流式 agent 一次性发完整 agent_message(而非逐 token 的 chunk):同样当文本处理,
  // 使这类 agent 的回复仍能渲染。真正的流式 agent 走上面的 chunk 分支逐段累积,
  // 不会走到这里,故无重复风险。
  if (tag === "agent_message" && u.content?.type === "text") {
    return typeof u.content.text === "string"
      ? { kind: "agent_text", text: u.content.text }
      : { kind: "ignore" };
  }
  if (tag === "tool_call") {
    const id = String(u.toolCallId ?? "");
    if (!id) return { kind: "ignore" };
    return {
      kind: "tool_new",
      rec: {
        id,
        title: typeof u.title === "string" ? u.title : "",
        status: parseStatus(u.status) ?? "pending",
        text: extractText(u.content),
        locations: extractLocations(u.locations),
      },
    };
  }
  if (tag === "tool_call_update") {
    const id = String(u.toolCallId ?? "");
    if (!id) return { kind: "ignore" };
    const patch: Partial<ToolRecord> = {};
    if (typeof u.title === "string") patch.title = u.title;
    const st = parseStatus(u.status);
    if (st) patch.status = st;
    if (u.content !== undefined) patch.text = extractText(u.content);
    if (u.locations !== undefined) patch.locations = extractLocations(u.locations);
    return { kind: "tool_patch", id, patch };
  }
  // usage_update:agent 推送的上下文用量(used / size 窗口),供 UI 显示进度条。
  if (tag === "usage_update") {
    return {
      kind: "usage",
      used: typeof u.used === "number" ? u.used : 0,
      size: typeof u.size === "number" ? u.size : 0,
    };
  }
  return { kind: "ignore" };
}

/**
 * Model C 移交归一化(§2.4)。把当前线程压成给新 agent 的 seed(user message)。
 * 规则:保留 user / assistant 文本;工具结果压缩成一行(「谁在哪儿做了什么」);
 * 丢弃 thinking / permission / 逐 token 增量;末尾附当前 vault 上下文快照。
 */
export function normalizeForHandoff(
  msgs: Array<{ role: string; text: string }>,
  fromAgent: string,
  vaultCtx: string,
): string {
  const lines: string[] = [];
  lines.push(
    `> 承接自 ${fromAgent} 的线程(归一化简报)。以下是与上一个 agent 的对话骨架及它调用的工具摘要,请据此继续。`,
  );
  lines.push("");
  for (const m of msgs) {
    if (m.role === "user") {
      lines.push(`**我:** ${m.text}`);
    } else if (m.role === "agent") {
      lines.push(`**${fromAgent}:** ${m.text}`);
    } else if (m.role === "tool") {
      lines.push(`- 工具:${m.text}`);
    } else if (m.role === "error") {
      lines.push(`_(出错:${m.text})_`);
    }
  }
  if (vaultCtx.trim()) {
    lines.push("");
    lines.push("**当前 vault 上下文:**");
    lines.push(vaultCtx.trim());
  }
  return lines.join("\n");
}
