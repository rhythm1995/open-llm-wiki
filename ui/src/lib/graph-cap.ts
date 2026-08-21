/**
 * graph-cap —— 移动端图谱降采样(doc 18 §10.4)。
 *
 * force-graph 是 canvas 2D 模拟,节点多时在 iPhone 上掉帧。移动壳对 snapshot 做一次
 * 纯裁剪:优先保留「当前笔记 + 度数(连接数)最高的节点」到上限,边只保留两端都在
 * 集合内的(悬空边 to=null 跟随 from 保留)。纯函数,桌面不受影响。
 */
import type { VaultSnapshot } from "./ipc";

/** 移动端节点上限(度数排序取前 N)。 */
export const MOBILE_GRAPH_NODE_CAP = 500;

export function capGraphSnapshot(
  snap: VaultSnapshot,
  cap: number,
  keepPath?: string | null,
): VaultSnapshot {
  if (cap <= 0 || snap.nodes.length <= cap) return snap;

  // 度数:from 与 to(已解析)各计一端。
  const degree = new Map<number, number>();
  for (const n of snap.nodes) degree.set(n.id, 0);
  for (const e of snap.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    if (e.to !== null) degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  // 当前笔记无条件保留;其余按 度数 desc → id asc 的稳定序取满。
  const keep = new Set<number>();
  const current = keepPath
    ? snap.nodes.find((n) => n.path === keepPath)
    : undefined;
  if (current) keep.add(current.id);
  const ranked = [...snap.nodes]
    .filter((n) => !keep.has(n.id))
    .sort(
      (a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id - b.id,
    );
  for (const n of ranked) {
    if (keep.size >= cap) break;
    keep.add(n.id);
  }
  const nodes = snap.nodes.filter((n) => keep.has(n.id));
  // 边要求两端都在集合内;悬空边(to=null)跟随 from 保留(渲染为未解析链接)。
  const edges = snap.edges.filter(
    (e) => keep.has(e.from) && (e.to === null || keep.has(e.to)),
  );
  return { root: snap.root, nodes, edges };
}
