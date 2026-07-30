/**
 * vault-watch —— watcher 路径 debounce / 世代守卫的纯逻辑(可测)。
 *
 * - 多帧 vault-changed 在 debounce 窗内 **并集** 路径(禁止 last-wins 丢 delta)。
 * - 异步 apply 完成时用 generation + root 守卫,防止切 vault / 后发先至污染 state。
 * - 空批或 apply 失败 → force 全量自愈。
 */

/** 把 incoming 并入 pending(原地改 Set)。 */
export function mergeWatchPaths(
  pending: Set<string>,
  incoming: readonly string[] | null | undefined,
): Set<string> {
  if (!incoming) return pending;
  for (const p of incoming) {
    if (typeof p === "string" && p.length > 0) pending.add(p);
  }
  return pending;
}

/** 取出并清空 pending(排序保证稳定)。 */
export function takeWatchBatch(pending: Set<string>): string[] {
  const batch = [...pending].sort();
  pending.clear();
  return batch;
}

/** 空批或 apply 失败 → 应 force 全量自愈。 */
export function shouldForceHeal(batch: readonly string[], applyFailed: boolean): boolean {
  return applyFailed || batch.length === 0;
}

/** 异步完成时:世代是否仍是最新(后发请求不得写 state)。 */
export function isWatchGenCurrent(myGen: number, currentGen: number): boolean {
  return myGen === currentGen;
}

/** 异步完成时:目标 root 是否仍是当前 vault。 */
export function isWatchRootCurrent(
  expectedRoot: string,
  currentRoot: string | null | undefined,
): boolean {
  return currentRoot != null && currentRoot === expectedRoot;
}

/**
 * 是否允许把 watcher 结果写回 UI/live。
 * generation 与 root 任一过期 → 丢弃。
 */
export function canCommitWatchResult(
  myGen: number,
  currentGen: number,
  expectedRoot: string,
  currentRoot: string | null | undefined,
): boolean {
  return (
    isWatchGenCurrent(myGen, currentGen) && isWatchRootCurrent(expectedRoot, currentRoot)
  );
}
