/**
 * graph-filter.ts —— 图谱过滤/邻域的纯逻辑(F-GRAPH 的核心竞争力,可测)。
 *
 * 过滤叠加生效:
 *   1. type  显隐(空集=全显)
 *   2. tag   显隐(空集=全显)
 *   3. status 显隐(空集=全显;无 status 用 STATUSLESS)
 *   4. query  标题/路径子串(空串=不过滤;命中的节点记入 textHits 供高亮)
 *   5. relation(wiki/relation)显隐 —— 只裁边,节点不因此消失
 *   6. 孤儿隐藏(无任何已解析边的节点)
 * 再叠加一道"邻域收窄":给定 focusId + hops,只保留 N 跳可达(无向)的节点。
 *
 * 边的可见性 = relation 过滤通过 ∧ 两端(已解析的)都可见;悬空边(to=null)
 * 只要 from 可见即保留(它们画成虚桩,本身就是图谱要展示的"缺页"信号)。
 *
 * UI(GraphView)只调用 applyGraphFilters 并按返回集合渲染;纯逻辑在这里被测住。
 */
import type { EdgeOut, NodeOut } from "./ipc";

export type EdgeKind = "wiki" | "relation";

export interface GraphFilters {
  types: Set<string>;
  tags: Set<string>;
  /** status 显隐;空集=全显。 */
  statuses: Set<string>;
  /** 标题/路径子串过滤(大小写不敏感);空串=不过滤。 */
  query: string;
  relations: Set<EdgeKind>;
  hideOrphans: boolean;
  /** 隐藏悬空/未解析边(to=null 的 ghost 桩)。节点可见性不受影响。 */
  hideUnresolved: boolean;
  /** 非空时收窄到该节点 N 跳邻域。 */
  focusId: number | null;
  hops: number;
}

export interface FilteredGraph {
  nodeIds: Set<number>;
  edges: EdgeOut[];
  /** query 非空时,标题/路径命中的节点(用于高亮;仍须在 nodeIds 内)。 */
  textHits: Set<number>;
}

/** 无 type 的节点在 type 过滤里的占位标签。 */
export const TYPELESS = "—";

/** 无 status 的节点在 status 过滤里的占位。 */
export const STATUSLESS = "—";

/** 空过滤(全显)。 */
export const NO_FILTER: GraphFilters = {
  types: new Set(),
  tags: new Set(),
  statuses: new Set(),
  query: "",
  relations: new Set(),
  hideOrphans: false,
  hideUnresolved: false,
  focusId: null,
  hops: 1,
};

/** vault 里出现过的 type 列表(去重;null → TYPELESS)。 */
export function distinctTypes(nodes: NodeOut[]): string[] {
  const s = new Set<string>();
  for (const n of nodes) s.add(n.type ?? TYPELESS);
  return [...s];
}

/** vault 里出现过的 tag 列表(去重)。 */
export function distinctTags(nodes: NodeOut[]): string[] {
  const s = new Set<string>();
  for (const n of nodes) for (const t of n.tags) s.add(t);
  return [...s];
}

/** vault 里出现过的 status 列表(去重;null → STATUSLESS)。 */
export function distinctStatuses(nodes: NodeOut[]): string[] {
  const s = new Set<string>();
  for (const n of nodes) s.add(n.status ?? STATUSLESS);
  return [...s];
}

/** 标题/路径是否命中 query(空 query 视为全命中)。 */
export function matchesGraphQuery(n: NodeOut, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    n.title.toLowerCase().includes(q) ||
    n.path.toLowerCase().includes(q) ||
    (n.preview ?? "").toLowerCase().includes(q)
  );
}

export function applyGraphFilters(
  nodes: NodeOut[],
  edges: EdgeOut[],
  f: GraphFilters,
): FilteredGraph {
  const typeOk = (n: NodeOut) => f.types.size === 0 || f.types.has(n.type ?? TYPELESS);
  const tagOk = (n: NodeOut) => f.tags.size === 0 || n.tags.some((t) => f.tags.has(t));
  const statusOk = (n: NodeOut) =>
    f.statuses.size === 0 || f.statuses.has(n.status ?? STATUSLESS);
  const q = f.query.trim();
  const textOk = (n: NodeOut) => matchesGraphQuery(n, q);

  // 解析边度数(用于孤儿判定)。
  const deg = new Map<number, number>();
  for (const e of edges) {
    if (e.to == null) continue;
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }

  let visible = new Set<number>();
  const textHits = new Set<number>();
  for (const n of nodes) {
    if (!typeOk(n) || !tagOk(n) || !statusOk(n) || !textOk(n)) continue;
    if (f.hideOrphans && (deg.get(n.id) ?? 0) === 0 && n.id !== f.focusId) continue;
    visible.add(n.id);
    if (q && matchesGraphQuery(n, q)) textHits.add(n.id);
  }

  // 邻域收窄:从 focus 沿(可见节点间的)无向边 BFS N 跳。
  if (f.focusId != null) {
    if (!visible.has(f.focusId)) {
      visible = new Set();
    } else {
      const adj = new Map<number, number[]>();
      for (const e of edges) {
        if (e.to == null) continue;
        if (!visible.has(e.from) || !visible.has(e.to)) continue;
        if (!adj.has(e.from)) adj.set(e.from, []);
        if (!adj.has(e.to)) adj.set(e.to, []);
        adj.get(e.from)!.push(e.to);
        adj.get(e.to)!.push(e.from);
      }
      const reach = new Set<number>([f.focusId]);
      let frontier = [f.focusId];
      for (let h = 0; h < f.hops && frontier.length > 0; h++) {
        const next: number[] = [];
        for (const u of frontier) {
          for (const v of adj.get(u) ?? []) {
            if (!reach.has(v)) {
              reach.add(v);
              next.push(v);
            }
          }
        }
        frontier = next;
      }
      visible = reach;
    }
  }

  const relOk = (e: EdgeOut) => f.relations.size === 0 || f.relations.has(e.kind);
  const visEdges = edges.filter((e) => {
    if (!relOk(e)) return false;
    // 隐藏悬空/未解析边(ghost 桩):只裁边,不影响节点可见性。
    if (f.hideUnresolved && e.to == null) return false;
    if (!visible.has(e.from)) return false;
    if (e.to != null && !visible.has(e.to)) return false;
    return true;
  });

  // 邻域收窄后只保留仍可见的 text hits。
  const hits = new Set<number>();
  for (const id of textHits) if (visible.has(id)) hits.add(id);

  return { nodeIds: visible, edges: visEdges, textHits: hits };
}
