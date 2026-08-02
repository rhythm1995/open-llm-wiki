/**
 * graph-health —— 图健康度**派生纯逻辑**(B-GRAPH-HEALTH-UI / B-MCP-LINKS 共用语义)。
 *
 * 从 GraphModel(已含 nodes / edges / degree)派生:孤儿 / 枢纽 / 悬空目标。
 * 无 IO、无 React;UI(Orphans·Hubs 模式)与未来 MCP 侧 core 方法共用同一语义。
 *
 * 与 core 侧 `Graph::orphans/hubs/dead_links` 保持一致定义(见 core/src/graph.rs)。
 */
import type { GraphModel } from "./graph-model";

/** 孤儿判定的方向。both = 完全无已解析边(度数 0)。 */
export type OrphanMode = "incoming" | "outgoing" | "both";

/** 有向度数(仅已解析边 to!=null 计入)。 */
export interface DirectedDegree {
  in: number;
  out: number;
  /** in + out(无向合计,与 GraphModel.degree 一致)。 */
  total: number;
}

/** 枢纽条目。 */
export interface Hub {
  id: number;
  path: string;
  title: string;
  degree: number;
}

/** 悬空目标(ghost 边):指向未解析目标的出边。 */
export interface DeadLink {
  from: number;
  fromPath: string;
  /** 未解析目标文本([[target]] 原文 / relation 目标)。 */
  target: string;
  kind: "wiki" | "relation";
  relation: string | null;
}

/**
 * 计算每个节点的有向度数。返回 id → DirectedDegree(含所有节点,含 0)。
 */
export function directedDegrees(model: GraphModel): Map<number, DirectedDegree> {
  const deg = new Map<number, DirectedDegree>();
  for (const n of model.nodes) {
    deg.set(n.id, { in: 0, out: 0, total: 0 });
  }
  for (const e of model.edges) {
    if (e.to == null) continue; // 悬空边不计入度数
    const f = deg.get(e.from);
    if (f) f.out += 1;
    const t = deg.get(e.to);
    if (t) t.in += 1;
  }
  for (const d of deg.values()) d.total = d.in + d.out;
  return deg;
}

/** 单节点有向度数(便捷)。 */
export function degreeOf(model: GraphModel, id: number): DirectedDegree {
  return directedDegrees(model).get(id) ?? { in: 0, out: 0, total: 0 };
}

/**
 * 孤儿节点 id 列表(按 path 稳定排序)。
 *   - both:total 度数 0(完全无已解析边)
 *   - outgoing:出度 0
 *   - incoming:入度 0
 */
export function orphanIds(model: GraphModel, mode: OrphanMode = "both"): number[] {
  const deg = directedDegrees(model);
  const out: number[] = [];
  for (const n of model.nodes) {
    const d = deg.get(n.id)!;
    const isOrphan =
      mode === "both" ? d.total === 0 : mode === "outgoing" ? d.out === 0 : d.in === 0;
    if (isOrphan) out.push(n.id);
  }
  return out.sort((a, b) => {
    const pa = model.byId.get(a)?.path ?? "";
    const pb = model.byId.get(b)?.path ?? "";
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
}

/**
 * 枢纽:按 total 度数降序(同度按 path 升序)取前 `limit`。
 */
export function topHubs(model: GraphModel, limit = 10): Hub[] {
  const deg = directedDegrees(model);
  return model.nodes
    .map((n) => ({ node: n, d: deg.get(n.id)?.total ?? 0 }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d || (a.node.path < b.node.path ? -1 : 1))
    .slice(0, Math.max(0, limit))
    .map((x) => ({
      id: x.node.id,
      path: x.node.path,
      title: x.node.title,
      degree: x.d,
    }));
}

/** 节点是否枢纽:total 度数 >= threshold(默认 = 全库平均度数)。 */
export function isHub(model: GraphModel, id: number, threshold?: number): boolean {
  const d = degreeOf(model, id).total;
  const th = threshold ?? averageDegree(model);
  return d >= th && d > 0;
}

/** 全库平均 total 度数(枢纽阈值的默认参考)。空图返回 0。 */
export function averageDegree(model: GraphModel): number {
  if (model.nodes.length === 0) return 0;
  let sum = 0;
  for (const d of directedDegrees(model).values()) sum += d.total;
  return sum / model.nodes.length;
}

/**
 * 悬空目标列表:所有 to=null 的出边,带 from 节点与目标文本。
 * 同一 from 的多条按 target 文本稳定排序。
 */
export function deadLinks(model: GraphModel): DeadLink[] {
  const out: DeadLink[] = [];
  for (const e of model.edges) {
    if (e.to != null) continue;
    const fromNode = model.byId.get(e.from);
    out.push({
      from: e.from,
      fromPath: fromNode?.path ?? "",
      target: e.unresolved ?? "",
      kind: e.kind,
      relation: e.relation,
    });
  }
  return out.sort((a, b) =>
    a.fromPath < b.fromPath
      ? -1
      : a.fromPath > b.fromPath
        ? 1
        : a.target < b.target
          ? -1
          : a.target > b.target
            ? 1
            : 0,
  );
}

/**
 * 最短路径(BFS,无向,仅已解析边)。返回 from→to 的 id 序列(含两端)。
 *   - from === to → [from]
 *   - 任一端不在图里 / 不可达 → null
 * 悬空边(to=null)不参与;无向(可反向遍历)。
 */
export function shortestPath(
  model: GraphModel,
  from: number,
  to: number,
): number[] | null {
  if (!model.byId.has(from) || !model.byId.has(to)) return null;
  if (from === to) return [from];
  // 无向邻接(已解析边)。
  const adj = new Map<number, number[]>();
  for (const e of model.edges) {
    if (e.to == null) continue;
    const a = adj.get(e.from);
    if (a) a.push(e.to);
    else adj.set(e.from, [e.to]);
    const b = adj.get(e.to);
    if (b) b.push(e.from);
    else adj.set(e.to, [e.from]);
  }
  const prev = new Map<number, number>([[from, from]]);
  const queue: number[] = [from];
  let found = false;
  while (queue.length > 0 && !found) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        if (nb === to) {
          found = true;
          break;
        }
        queue.push(nb);
      }
    }
  }
  if (!found) return null;
  const path: number[] = [];
  let cur = to;
  while (cur !== from) {
    path.push(cur);
    const p = prev.get(cur);
    if (p === undefined) return null;
    cur = p;
  }
  path.push(from);
  path.reverse();
  return path;
}
