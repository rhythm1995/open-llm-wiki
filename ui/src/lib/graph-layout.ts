/**
 * graph-layout —— 图谱坐标/力参数/几何的**纯逻辑**(F-GRAPH,渲染器中立)。
 *
 * 力导向排布由 **force-graph / d3-force** 完成(ForceGraphLayer 映射 ForceParams);
 * 本文件只保留渲染器中立的共享件:
 *   - Pt / ForceParams / DEFAULT_FORCES / normalizeForces —— 力参数模型
 *   - bbox / fitTransform / visibleNodeIds —— 坐标几何(单测覆盖;布局/落盘共用)。
 *
 * 无 IO、无 React、可单测。
 */
export interface Pt {
  x: number;
  y: number;
}

/**
 * 可调力参数(Obsidian 心智:中心引力 / 斥力 / 弹簧强度 / 弹簧理想距离)。
 * 四项**互不依赖**:repel 缩放斥力,linkDistance 缩放弹簧理想长度,
 * linkStrength 缩放弹簧吸引,center 缩放向心引力。全部默认 1 = 基线。
 * ForceGraphLayer 把四项映射到 d3 charge / link distance / strength 等。
 */
export interface ForceParams {
  /** 向心引力倍率。 */
  center: number;
  /** 斥力倍率。 */
  repel: number;
  /** 弹簧吸引倍率。 */
  linkStrength: number;
  /** 弹簧理想距离倍率(独立于斥力)。 */
  linkDistance: number;
}

/** 基线力参数(全部 1)。 */
export const DEFAULT_FORCES: ForceParams = {
  center: 1,
  repel: 1,
  linkStrength: 1,
  linkDistance: 1,
};

const FORCE_CEIL = 50;
function clampFinite(v: unknown, lo: number, hi: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 1;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 合并部分力参数到基线并夹到安全区间(防 NaN/爆炸;linkDistance 下限避免除零)。
 * 缺省字段回退 1(基线)。非法/NaN 回退 1。
 */
export function normalizeForces(p?: Partial<ForceParams> | null): ForceParams {
  const f = p ?? {};
  return {
    center: clampFinite(f.center, 0, FORCE_CEIL),
    repel: clampFinite(f.repel, 0, FORCE_CEIL),
    linkStrength: clampFinite(f.linkStrength, 0, FORCE_CEIL),
    // linkDistance 下限 0.1,避免除以 ~0 产生爆炸性吸引。
    linkDistance: clampFinite(f.linkDistance, 0.1, FORCE_CEIL),
  };
}

/** 计算给定位置的包围盒 [minX,minY,maxX,maxY];空集返回 null。 */
export function bbox(ids: number[], pos: Map<number, Pt>): [number, number, number, number] | null {
  if (ids.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

/**
 * 由包围盒算「适应视图」变换:使 graph 坐标的 bbox 居中填满画布(留白 pad)。
 * 返回 {tx,ty,scale};bbox 为 null 或退化时回退到单位变换。scale 被 clamp 到 [min,max]。
 */
export function fitTransform(
  box: [number, number, number, number] | null,
  w: number,
  h: number,
  pad: number,
  min: number,
  max: number,
): { tx: number; ty: number; scale: number } {
  if (!box) return { tx: 0, ty: 0, scale: 1 };
  const [minX, minY, maxX, maxY] = box;
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const scale = Math.max(min, Math.min(max, (w - 2 * pad) / bw, (h - 2 * pad) / bh));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { tx: w / 2 - cx * scale, ty: h / 2 - cy * scale, scale };
}

/**
 * 视口剔除:返回经变换 `tf` 后落在画布 `[−margin, w+margin] × [−margin, h+margin]`
 * 内的节点 id 集合(graph 坐标 → 屏幕:`sx = x·scale + tx`)。位置缺失的节点不计入。
 */
export function visibleNodeIds(
  ids: number[],
  pos: Map<number, Pt>,
  tf: { tx: number; ty: number; scale: number },
  viewport: { w: number; h: number },
  margin: number,
): Set<number> {
  const { w, h } = viewport;
  const lo = -margin;
  const xHi = w + margin;
  const yHi = h + margin;
  const out = new Set<number>();
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    const sx = p.x * tf.scale + tf.tx;
    const sy = p.y * tf.scale + tf.ty;
    if (sx >= lo && sx <= xHi && sy >= lo && sy <= yHi) out.add(id);
  }
  return out;
}
