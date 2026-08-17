/**
 * vault-query —— 「查询 Vault」Agent 短触发(纯逻辑)。
 *
 * 与 wiki-digest 同构:只产出预填进应用内 Agent 的固定提示词。
 * 不教用户写 QQL;不假设应用内 ACP 已注入 MCP。
 */

export function buildVaultQueryPrompt(question?: string): string {
  const q = (question ?? "").trim();
  const questionBlock = q ? `\n**Question:** \`${q}\`\n` : "";
  const waitLine = q ? "" : "\n等待用户在下一句给出问题。\n";
  return `请把用户的自然语言问题编译成 QQL，先写出完整语句再跑 \`run_qql\`（没有该工具就打印 QQL，并让用户用「库健康」）。
${questionBlock}
约束: WHERE/SORT/LIMIT/SHOW/RENDER；分组用 RENDER group_by(field)；无入边 \`mentioned_in.len() = 0\`；缺字段 \`NOT has <field>\`。只读，不要写 Query 笔记。
${waitLine}`;
}
