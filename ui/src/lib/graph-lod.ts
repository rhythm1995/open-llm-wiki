/**
 * graph-lod —— 低缩放层级细节(LOD)纯逻辑。
 *
 * 节点很多且视图缩得很小时,把邻近节点并成超级节点,减轻标签/拾取压力。
 * 网格聚类:cellSize 越大簇越大。展开后仍可用 memberIds 做「点进聚焦」。
 *
 * 无 IO、无 React。
 */
import type { Pt } from "./graph-layout";

export interface LodCluster {
  /** 网格键 `gx,gy`。 */
  key: string;
  memberIds: number[];
  /** 成员位置均值。 */
  x: number;
  y: number;
  size: number;
}

export interface LodResult {
  /** true = 使用聚类视图。 */
  active: boolean;
  clusters: LodCluster[];
  /** 未聚类时与 ids 相同;聚类时为空(渲染用 clusters)。 */
  leafIds: number[];
}

/**
 * 是否启用 LOD:
 * - 节点数 ≥ minNodes
 * - 且 scale ≤ maxScale(缩得够小)
 */
export function shouldUseLod(
  nodeCount: number,
  scale: number,
  opts: { minNodes?: number; maxScale?: number } = {},
): boolean {
  const minNodes = opts.minNodes ?? 400;
  const maxScale = opts.maxScale ?? 0.55;
  return nodeCount >= minNodes && scale <= maxScale;
}

/**
 * 按屏幕等效 cell 大小聚类。cellSize 是 **图坐标** 下的格子边长
 * (调用方可用 `baseCell / scale` 使屏幕上簇大小近似恒定)。
 */
export function clusterByGrid(
  ids: readonly number[],
  pos: ReadonlyMap<number, Pt>,
  cellSize: number,
): LodCluster[] {
  const cell = Math.max(cellSize, 1e-6);
  const buckets = new Map<string, number[]>();
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    const key = `${gx},${gy}`;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(id);
  }
  const out: LodCluster[] = [];
  for (const [key, memberIds] of buckets) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const id of memberIds) {
      const p = pos.get(id)!;
      sx += p.x;
      sy += p.y;
      n++;
    }
    out.push({
      key,
      memberIds,
      x: sx / n,
      y: sy / n,
      size: n,
    });
  }
  return out;
}

/**
 * 综合决策:若应启用 LOD 则返回 clusters;否则 leafIds = 全部 ids。
 * 单成员簇可折叠回 leaf(可选 flattenSingletons)。
 */
export function applyLod(
  ids: readonly number[],
  pos: ReadonlyMap<number, Pt>,
  scale: number,
  opts: {
    minNodes?: number;
    maxScale?: number;
    /** 图坐标 cell;默认 80/scale 使屏幕上约 80px。 */
    cellSize?: number;
    flattenSingletons?: boolean;
  } = {},
): LodResult {
  if (!shouldUseLod(ids.length, scale, opts)) {
    return { active: false, clusters: [], leafIds: [...ids] };
  }
  const cellSize = opts.cellSize ?? 80 / Math.max(scale, 0.05);
  let clusters = clusterByGrid(ids, pos, cellSize);
  const leafIds: number[] = [];
  if (opts.flattenSingletons !== false) {
    const multi: LodCluster[] = [];
    for (const c of clusters) {
      if (c.size === 1) leafIds.push(c.memberIds[0]);
      else multi.push(c);
    }
    clusters = multi;
    // 若全部是单点,等同未启用。
    if (clusters.length === 0) {
      return { active: false, clusters: [], leafIds: [...ids] };
    }
  }
  return { active: true, clusters, leafIds };
}

/** 超级节点半径:随成员数开方增长,有上下限。 */
export function clusterRadius(size: number): number {
  return Math.min(28, 6 + Math.sqrt(size) * 2.4);
}

/**
 * 节点 id → 渲染键:叶子用 `String(id)`,簇成员用 `c:${key}`。
 * 供边投影 / sigma 节点键对齐。
 */
export function buildLodRenderKeyMap(lod: LodResult): Map<number, string> {
  const m = new Map<number, string>();
  for (const id of lod.leafIds) m.set(id, String(id));
  for (const c of lod.clusters) {
    const key = `c:${c.key}`;
    for (const id of c.memberIds) m.set(id, key);
  }
  return m;
}

export interface LodProjectedEdge {
  key: string;
  source: string;
  target: string;
  kind: "wiki" | "relation";
  /** 聚合条数(簇间边可能 >1)。 */
  weight: number;
}

/**
 * 把原始边投影到 LOD 渲染键:
 * - 两端同键 → 丢弃(簇内边)
 * - 两端不同键 → 合并为一条(同 pair+kind 累加 weight)
 * - to=null 悬空边 → 不投影(由调用方画 ghost)
 */
export function projectLodEdges(
  edges: readonly {
    from: number;
    to: number | null;
    kind: "wiki" | "relation";
  }[],
  idToKey: ReadonlyMap<number, string>,
): LodProjectedEdge[] {
  const acc = new Map<string, LodProjectedEdge>();
  for (const e of edges) {
    if (e.to == null) continue;
    const s = idToKey.get(e.from);
    const t = idToKey.get(e.to);
    if (!s || !t || s === t) continue;
    // 无向规范化,避免 a-b 与 b-a 双线。
    const a = s < t ? s : t;
    const b = s < t ? t : s;
    const k = `${a}|${b}|${e.kind}`;
    const prev = acc.get(k);
    if (prev) prev.weight += 1;
    else acc.set(k, { key: k, source: a, target: b, kind: e.kind, weight: 1 });
  }
  return [...acc.values()];
}
