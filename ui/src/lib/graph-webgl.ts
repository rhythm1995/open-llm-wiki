/**
 * graph-webgl —— sigma/graphology 渲染辅助(纯函数 + 环境探测)。
 *
 * WebGL 着色器不解析 CSS 变量,颜色需落成 #rrggbb。
 * 主题 token 优先从 document 读,失败用 fallback。
 */
import type { Pt } from "./graph-layout";
import { clusterRadius, type LodCluster } from "./graph-lod";

/** 探测 WebGL 是否可用(测试 / 老环境 → false → SVG 回退)。 */
export function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false;
  // jsdom 无真实 GL,getContext 会刷 Not implemented 日志。
  if (
    typeof navigator !== "undefined" &&
    /jsdom/i.test(navigator.userAgent)
  ) {
    return false;
  }
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** 读 CSS 变量为颜色串;空则 fallback。 */
export function cssColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** 类型 → 颜色(hex/token fallback,与 SVG GraphView 语义一致)。 */
export function typeColorResolved(type: string | null): string {
  switch (type) {
    case "Source":
      return cssColor("--color-yellow", "#df8e1d");
    case "Concept":
      return cssColor("--color-mauve", "#8839ef");
    case "Entity":
      return cssColor("--color-teal", "#179299");
    case "Summary":
      return cssColor("--color-green", "#40a02b");
    case "Note":
      return cssColor("--color-blue", "#1e66f5");
    default:
      return cssColor("--color-overlay", "#9ca0b0");
  }
}

export function edgeColorResolved(kind: "wiki" | "relation", hot: boolean): string {
  if (hot) return cssColor("--color-blue", "#1e66f5");
  if (kind === "relation") return cssColor("--color-mauve", "#8839ef");
  return cssColor("--color-overlay", "#9ca0b0");
}

export function clusterColorResolved(): string {
  return cssColor("--color-blue", "#1e66f5");
}

export function baseBgResolved(): string {
  return cssColor("--color-base", "#1e1e2e");
}

export function labelColorResolved(): string {
  return cssColor("--color-text", "#cdd6f4");
}

/** 节点渲染尺寸:按度数开方。 */
export function nodeSizeFromDegree(deg: number): number {
  return 3 + Math.sqrt(Math.max(0, deg)) * 2.2;
}

/** 给 #rgb/#rrggbb 或已是 rgba 的颜色叠透明度(邻域压暗)。 */
export function colorWithAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const rgba = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((s) => s.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
  }
  return color;
}

export function unresolvedColorResolved(): string {
  return cssColor("--color-red", "#d20f39");
}

export function pinColorResolved(): string {
  return cssColor("--color-mauve", "#8839ef");
}

export interface SigmaNodeAttrs {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  /** 业务 id(数值)。 */
  nodeId: number;
  /** cluster 超级节点。 */
  isCluster?: boolean;
  memberIds?: number[];
  /** 簇中心(展开相机用)。 */
  clusterX?: number;
  clusterY?: number;
  forceLabel?: boolean;
  highlighted?: boolean;
  hidden?: boolean;
  type?: string;
  /** 悬空边 ghost 桩。 */
  isGhost?: boolean;
}

export interface SigmaEdgeAttrs {
  size: number;
  color: string;
  kind: "wiki" | "relation";
  type?: string;
}

/**
 * 把布局位置 + 节点元数据收成 sigma 可吃的节点属性表(key = String(id))。
 */
export function buildSigmaNodeAttrs(
  ids: readonly number[],
  pos: ReadonlyMap<number, Pt>,
  meta: ReadonlyMap<
    number,
    { title: string; type: string | null; degree: number }
  >,
  opts: {
    currentId: number | null;
    hoverId: number | null;
    selected: ReadonlySet<number>;
    textHits: ReadonlySet<number>;
    pinned?: ReadonlySet<number>;
    focusId?: number | null;
    /** 非 null 时:不在集合内的节点压暗。 */
    neighborFocus?: ReadonlySet<number> | null;
    forceLabelAll: boolean;
    /**
     * 允许显示标签的 id(避让结果)。
     * 未传则回退旧规则(度数/焦点)。
     */
    labelAllow?: ReadonlySet<number> | null;
  },
): Map<string, SigmaNodeAttrs> {
  const out = new Map<string, SigmaNodeAttrs>();
  for (const id of ids) {
    const p = pos.get(id);
    const m = meta.get(id);
    if (!p || !m) continue;
    const important =
      id === opts.currentId ||
      id === opts.hoverId ||
      opts.selected.has(id) ||
      opts.textHits.has(id) ||
      !!opts.pinned?.has(id) ||
      id === opts.focusId;
    const forceLabel = opts.labelAllow
      ? opts.labelAllow.has(id) || important
      : opts.forceLabelAll || m.degree >= 4 || important;
    const dim =
      opts.neighborFocus != null && !opts.neighborFocus.has(id);
    let color = typeColorResolved(m.type);
    if (dim) color = colorWithAlpha(color, 0.18);
    out.set(String(id), {
      x: p.x,
      y: p.y,
      size: nodeSizeFromDegree(m.degree),
      label: m.title,
      color,
      nodeId: id,
      forceLabel,
      highlighted:
        id === opts.currentId ||
        opts.selected.has(id) ||
        opts.textHits.has(id) ||
        !!opts.pinned?.has(id),
    });
  }
  return out;
}

/** LOD 簇 → 伪节点属性(key = `c:${cluster.key}`)。 */
export function buildSigmaClusterAttrs(
  clusters: readonly LodCluster[],
): Map<string, SigmaNodeAttrs> {
  const out = new Map<string, SigmaNodeAttrs>();
  const color = clusterColorResolved();
  for (const c of clusters) {
    out.set(`c:${c.key}`, {
      x: c.x,
      y: c.y,
      size: clusterRadius(c.size),
      label: String(c.size),
      color,
      nodeId: -1,
      isCluster: true,
      memberIds: c.memberIds,
      clusterX: c.x,
      clusterY: c.y,
      forceLabel: true,
      highlighted: false,
    });
  }
  return out;
}

/**
 * 悬空边 ghost 桩:源节点旁短偏移的红点,边连到它。
 * key = `u:${from}:${index}`
 */
export function buildUnresolvedGhosts(
  edges: readonly { from: number; to: number | null }[],
  pos: ReadonlyMap<number, Pt>,
  visibleIds: ReadonlySet<number>,
): {
  nodes: Map<string, SigmaNodeAttrs>;
  edges: { key: string; source: string; target: string }[];
} {
  const nodes = new Map<string, SigmaNodeAttrs>();
  const outEdges: { key: string; source: string; target: string }[] = [];
  const color = unresolvedColorResolved();
  let i = 0;
  for (const e of edges) {
    if (e.to != null) continue;
    if (!visibleIds.has(e.from)) continue;
    const p = pos.get(e.from);
    if (!p) continue;
    const key = `u:${e.from}:${i++}`;
    nodes.set(key, {
      x: p.x + 14,
      y: p.y - 14,
      size: 2.5,
      label: "",
      color,
      nodeId: -2,
      isGhost: true,
      forceLabel: false,
      highlighted: false,
    });
    outEdges.push({
      key: `ue:${key}`,
      source: String(e.from),
      target: key,
    });
  }
  return { nodes, edges: outEdges };
}
