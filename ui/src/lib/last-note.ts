/**
 * last-note —— "恢复上次打开的笔记"的纯决策 + 薄 IO 包装(F-打磨)。
 *
 * 按 vault root 分键存(`open-llm-wiki.lastPath:<root>`),避免 A vault 的路径在
 * B vault 误恢复。决策(`pickRestorableNote`)是纯逻辑、可单测;openVault 在
 * 拿到 entries 后调用它决定初始 currentPath。localStorage 不可用时(隐私模式
 * /禁用)静默退化为不持久化,不抛不崩。
 */

/** localStorage key:每个 vault root 独立。 */
export function lastPathKey(root: string): string {
  return `open-llm-wiki.lastPath:${root}`;
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

// ────────── 上次打开的 vault 根(跨重启恢复) ──────────
// 与 lastPath(按 root 分键、记某篇笔记)正交:这里记的是 root 本身,
// 使下次启动直接进入上次 vault,而非停在空态(Obsidian 同款行为)。
const LAST_ROOT_KEY = "open-llm-wiki.lastRoot";
/** 最近成功打开的 vault 列表(JSON string[], MRU 在前;与 lastRoot 同步维护)。 */
const RECENT_ROOTS_KEY = "open-llm-wiki.recentRoots";
/** 最近列表上限(欢迎页展示,不宜过长)。 */
export const RECENT_ROOTS_MAX = 5;

/** 读上次成功打开的 vault 根(localStorage 不可用 / 未存时返回 null,不抛)。 */
export function readLastRoot(): string | null {
  try {
    return localStorage.getItem(LAST_ROOT_KEY);
  } catch {
    return null;
  }
}

/** 记下成功打开的 vault 根,并推入最近列表(localStorage 不可用时静默)。 */
export function writeLastRoot(root: string): void {
  try {
    localStorage.setItem(LAST_ROOT_KEY, root);
  } catch {
    // 忽略:存储不可用时退化为不恢复。
  }
  pushRecentRoot(root);
}

/** 清除上次 vault 根(目录已不存在等恢复失败时调用)。 */
export function clearLastRoot(): void {
  try {
    localStorage.removeItem(LAST_ROOT_KEY);
  } catch {
    // 忽略。
  }
}

/**
 * 纯逻辑:把 `root` 推到 MRU 列表头部,去重、截断到 `max`。
 * 空串忽略;返回新数组(不修改入参)。
 */
export function mergeRecentRoot(
  roots: string[],
  root: string,
  max = RECENT_ROOTS_MAX,
): string[] {
  const trimmed = root.trim();
  if (!trimmed) return roots.slice(0, max);
  const next = [trimmed, ...roots.filter((r) => r !== trimmed)];
  return next.slice(0, Math.max(1, max));
}

/** 纯逻辑:从列表移除某一根路径。 */
export function removeRecentRootFromList(roots: string[], root: string): string[] {
  return roots.filter((r) => r !== root);
}

/** 读最近 vault 列表(坏 JSON / 不可用 → 空数组)。 */
export function readRecentRoots(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ROOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, RECENT_ROOTS_MAX);
  } catch {
    return [];
  }
}

/** 写最近列表(不可用时静默)。 */
export function writeRecentRoots(roots: string[]): void {
  try {
    localStorage.setItem(
      RECENT_ROOTS_KEY,
      JSON.stringify(roots.slice(0, RECENT_ROOTS_MAX)),
    );
  } catch {
    // 忽略。
  }
}

/** 成功打开后推入 MRU。 */
export function pushRecentRoot(root: string): void {
  writeRecentRoots(mergeRecentRoot(readRecentRoots(), root));
}

/** 打开失败 / 用户移除时从最近列表删掉;若恰是 lastRoot 也清 lastRoot。 */
export function forgetRecentRoot(root: string): void {
  writeRecentRoots(removeRecentRootFromList(readRecentRoots(), root));
  if (readLastRoot() === root) clearLastRoot();
}
