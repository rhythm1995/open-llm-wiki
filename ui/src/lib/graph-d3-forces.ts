/**
 * graph-d3-forces —— 把图谱力参数(Obsidian 心智:中心/斥力/弹簧强度/弹簧距离)
 * 映射成 d3-force 配置(纯函数)。
 *
 * 四个滑条(center/repel/linkStrength/linkDistance,默认全 1)经此映射后驱动
 * react-force-graph 的 forceManyBody / forceLink / forceX / forceY。
 * 默认值对应一个平静、可读的 canvas-2D 布局;之后可继续用既有滑条微调。
 */
import type { ForceParams } from "./graph-layout";

export interface D3ForceConfig {
  /** forceManyBody().strength(负值,斥力)。 */
  chargeStrength: number;
  /** forceLink().strength(0..1)。 */
  linkStrength: number;
  /** forceLink().distance(px)。 */
  linkDistance: number;
  /** forceX(画布中心).strength。 */
  xStrength: number;
  /** forceY(画布中心).strength。 */
  yStrength: number;
}

const BASE_LINK_PX = 36;
const FORCE_CEIL = 50;

function clampParam(v: number | undefined): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(FORCE_CEIL, n));
}

/**
 * @param params 力参数(调用方应先 normalizeForces,但此处对 NaN/越界同样兜底)。
 * @param opts 画布尺寸 + 节点数(用于按密度缩放斥力,避免大图爆炸)。
 */
export function d3ForceParams(
  params: ForceParams,
  opts: { w: number; h: number; nodeCount: number },
): D3ForceConfig {
  const repel = clampParam(params.repel);
  const linkStrength = clampParam(params.linkStrength);
  // linkDistance 下限 0.1(乘以 BASE 后 ≈3.6px),避免弹簧距离归零导致节点坍缩。
  const linkDistance = Math.max(0.1, clampParam(params.linkDistance));
  const center = clampParam(params.center);

  // 画布越大、节点越少 → 单节点可用空间越多 → 斥力越强(像素空间)。
  const n = Math.max(1, opts.nodeCount);
  const baseCharge = 60 + Math.sqrt((opts.w * opts.h) / n);
  const chargeStrength = Math.max(-4000, Math.min(0, -baseCharge * repel));

  return {
    chargeStrength,
    linkStrength: Math.max(0, Math.min(1, 0.3 * linkStrength)),
    linkDistance: linkDistance * BASE_LINK_PX,
    xStrength: Math.max(0, Math.min(1, 0.045 * center)),
    yStrength: Math.max(0, Math.min(1, 0.045 * center)),
  };
}
