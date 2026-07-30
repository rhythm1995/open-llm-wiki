/**
 * graph-model —— 图谱的 path-stable 视图模型(F-GRAPH 重构)。
 *
 * Vault 索引用数值 id;跨次 index / 增量 apply 后 id 可能重排,但 **path 是文件真相**。
 * 本层把 NodeOut/EdgeOut 收成:
 *   - byPath / byId 双向索引
 *   - degree(仅已解析边)
 *   - structureSignature(布局 gate:结构未变则不重跑 FR)
 *   - topKByDegree(大图截断枢纽优先)
 *
 * 无 IO、无 React;GraphView / Worker / sigma 都吃这里。
 */
import type { EdgeOut, NodeOut } from "./ipc";

/** 图节点:保留 vault id 兼容过滤层,path 为稳定主键。 */
export interface GraphNode {
  id: number;
  path: string;
  title: string;
  type: string | null;
  tags: string[];
  status: string | null;
  preview: string;
}

export interface GraphEdge {
  from: number;
  to: number | null;
  unresolved: string | null;
  kind: "wiki" | "relation";
  relation: string | null;
  anchor: string | null;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Map<number, GraphNode>;
  byPath: Map<string, GraphNode>;
  /** 已解析边两端的度数(无向)。 */
  degree: Map<number, number>;
}

/** 规范化 path 作 map 键(统一 `/`,去首尾空白)。 */
export function pathKey(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

/** 从 vault 快照节点/边构建模型。 */
export function buildGraphModel(
  nodes: readonly NodeOut[],
  edges: readonly EdgeOut[],
): GraphModel {
  const graphNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    path: n.path,
    title: n.title,
    type: n.type,
    tags: n.tags,
    status: n.status,
    preview: n.preview,
  }));
  const byId = new Map<number, GraphNode>();
  const byPath = new Map<string, GraphNode>();
  for (const n of graphNodes) {
    byId.set(n.id, n);
    byPath.set(pathKey(n.path), n);
  }
  const graphEdges: GraphEdge[] = edges.map((e) => ({
    from: e.from,
    to: e.to,
    unresolved: e.unresolved,
    kind: e.kind,
    relation: e.relation,
    anchor: e.anchor,
  }));
  const degree = computeDegree(graphEdges);
  return { nodes: graphNodes, edges: graphEdges, byId, byPath, degree };
}

/** 仅已解析边计入度数。 */
export function computeDegree(edges: readonly GraphEdge[]): Map<number, number> {
  const d = new Map<number, number>();
  for (const e of edges) {
    if (e.to == null) continue;
    d.set(e.from, (d.get(e.from) ?? 0) + 1);
    d.set(e.to, (d.get(e.to) ?? 0) + 1);
  }
  return d;
}

/**
 * 结构签名:节点集 + 边端点。布局 / 重绘 gate 用;
 * pan/zoom/hover 不改变签名。
 */
export function structureSignature(
  ids: readonly number[],
  edges: readonly { from: number; to: number | null }[],
): string {
  const idStr = [...ids].sort((a, b) => a - b).join(",");
  const eStr = edges
    .map((e) => `${e.from}->${e.to ?? "?"}`)
    .sort()
    .join(",");
  return `${ids.length}|${idStr}|${eStr}`;
}

/**
 * 按度数取 top-K(枢纽优先);同度按 id 稳定排序。
 * ids 长度 ≤ k 时原序拷贝返回。
 */
export function topKByDegree(
  ids: readonly number[],
  degree: ReadonlyMap<number, number>,
  k: number,
): number[] {
  if (ids.length <= k) return [...ids];
  return [...ids]
    .sort(
      (a, b) =>
        (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a - b,
    )
    .slice(0, k);
}

/** WebGL 路径默认截断上限(sigma 可轻松吃到上千)。 */
export const WEBGL_MAX_NODES = 2000;
/** SVG 回退截断(DOM 成本高)。 */
export const SVG_MAX_NODES = 400;

/**
 * pin 集合跨 id 重排时用 path 持久化:
 * 把当前 pin 的 id 映射到 path 集合。
 */
export function pinIdsToPaths(
  pinned: ReadonlySet<number>,
  byId: ReadonlyMap<number, GraphNode>,
): Set<string> {
  const out = new Set<string>();
  for (const id of pinned) {
    const n = byId.get(id);
    if (n) out.add(pathKey(n.path));
  }
  return out;
}

/** 从 path 集合还原 pin id(新快照上)。 */
export function pinPathsToIds(
  paths: ReadonlySet<string>,
  byPath: ReadonlyMap<string, GraphNode>,
): Set<number> {
  const out = new Set<number>();
  for (const p of paths) {
    const n = byPath.get(pathKey(p));
    if (n) out.add(n.id);
  }
  return out;
}
