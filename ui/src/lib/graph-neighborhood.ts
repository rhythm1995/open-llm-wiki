/**
 * graph-neighborhood —— 邻域 BFS(纯函数)。
 *
 * 给定无向邻接表,从根节点出发做 N 跳 BFS,返回根 + N 跳内的所有节点 id。
 * 用于"邻域图":只渲染当前笔记周围的小世界,避免全 vault 大图挤成一团
 * (参见 inkeep 默认 2-hop、openwiki 干脆不画全局图)。
 *
 * 抽成纯函数便于单测跳数边界、环、孤立点等行为,GraphView 直接调用。
 */

export type Adjacency = ReadonlyMap<number, ReadonlySet<number>>;

/**
 * N 跳邻域。根不在邻接表里 → 只返回根。hops≤0 → 只根。
 * 用 visited 集去重,故环不会死循环。
 */
export function neighborhoodOf(
  adj: Adjacency,
  root: number,
  hops: number,
): Set<number> {
  const visited = new Set<number>([root]);
  if (hops <= 0) return visited;
  let frontier: number[] = [root];
  for (let h = 0; h < hops; h++) {
    const next: number[] = [];
    for (const id of frontier) {
      const ns = adj.get(id);
      if (ns)
        for (const nb of ns)
          if (!visited.has(nb)) {
            visited.add(nb);
            next.push(nb);
          }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return visited;
}
