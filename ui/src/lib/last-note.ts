/**
 * last-note —— "恢复上次打开的笔记"的纯决策 + 薄 IO 包装(F-打磨)。
 *
 * 按 vault root 分键存(`openobs.lastPath:<root>`),避免 A vault 的路径在
 * B vault 误恢复。决策(`pickRestorableNote`)是纯逻辑、可单测;openVault 在
 * 拿到 entries 后调用它决定初始 currentPath。localStorage 不可用时(隐私模式
 * /禁用)静默退化为不持久化,不抛不崩。
 */

/** localStorage key:每个 vault root 独立。 */
export function lastPathKey(root: string): string {
  return `openobs.lastPath:${root}`;
}

/**
 * 从候选路径里挑出"上次打开的笔记":lastPath 非空且仍在 vault 中才返回,否则 null。
 * 纯逻辑(无 IO)。
 */
export function pickRestorableNote(
  lastPath: string | null,
  knownPaths: string[],
): string | null {
  if (!lastPath) return null;
  return knownPaths.includes(lastPath) ? lastPath : null;
}

/** 读上次路径(localStorage 不可用 / 未存时返回 null,不抛)。 */
export function readLastPath(root: string): string | null {
  try {
    return localStorage.getItem(lastPathKey(root));
  } catch {
    return null;
  }
}

/** 写上次路径(localStorage 不可用时静默)。 */
export function writeLastPath(root: string, path: string): void {
  try {
    localStorage.setItem(lastPathKey(root), path);
  } catch {
    // 忽略:存储不可用时退化为不持久化。
  }
}
