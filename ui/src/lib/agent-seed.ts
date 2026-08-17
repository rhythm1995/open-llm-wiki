/**
 * Agent composer seed 消费记录(提炼 / 查询 Vault)。
 *
 * token 在 App 里用 Date.now() 生成。已发送或已入队的 token 记在模块级 Set,
 * AgentPanel 卸载再挂载(Inspector ↔ Agent、关右栏再开)时 lastAutoSentToken
 * 会丢,靠这里挡住同一条指令再发一遍。
 */

const MAX_CONSUMED = 32;
const consumed = new Set<number>();

export function markAgentSeedConsumed(token: number): void {
  if (consumed.has(token)) return;
  consumed.add(token);
  if (consumed.size > MAX_CONSUMED) {
    const oldest = consumed.values().next().value;
    if (oldest != null) consumed.delete(oldest);
  }
}

export function isAgentSeedConsumed(token: number): boolean {
  return consumed.has(token);
}

/** 单测隔离;产品路径不要调。 */
export function resetAgentSeedConsumedForTests(): void {
  consumed.clear();
}
