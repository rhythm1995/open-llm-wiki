/**
 * graph-label —— 标签避让(纯逻辑)。
 *
 * 低缩放时标题互相重叠糊成一片:在屏幕坐标上按优先级贪心占格,
 * 高优先级(当前/悬停/选中/高度数)先占,冲突则丢弃。
 * SVG 与 WebGL 共用同一套决策。
 */
import type { Pt } from "./graph-layout";

export interface LabelCandidate {
  id: number;
  /** 图坐标。 */
  x: number;
  y: number;
  /** 越大越优先显示。 */
  priority: number;
  /** 估算标签宽(屏像素);缺省按标题长度粗估。 */
  widthPx?: number;
  title?: string;
}

export interface LabelDeclutterOpts {
  /** 图→屏:`sx = x*scale + tx`。 */
  scale: number;
  tx: number;
  ty: number;
  /** 标签占位高度(屏像素)。 */
  lineHeight?: number;
  /** 最小水平间距(屏像素)。 */
  padX?: number;
  /** 最小垂直间距。 */
  padY?: number;
  /** 最多显示标签数(0 = 不限制)。 */
  maxLabels?: number;
}

/**
 * 返回允许显示标签的节点 id 集合。
 * 已 force 的候选(priority 极高)仍可能因 maxLabels 被挤掉——调用方
 * 可把当前/悬停 priority 设到足够高。
 */
export function pickVisibleLabels(
  candidates: readonly LabelCandidate[],
  opts: LabelDeclutterOpts,
): Set<number> {
  const lineH = opts.lineHeight ?? 14;
  const padX = opts.padX ?? 6;
  const padY = opts.padY ?? 4;
  const max =
    opts.maxLabels && opts.maxLabels > 0 ? opts.maxLabels : Infinity;

  const ranked = [...candidates].sort(
    (a, b) => b.priority - a.priority || a.id - b.id,
  );

  // 已占用的轴对齐盒(屏坐标)。
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out = new Set<number>();

  for (const c of ranked) {
    if (out.size >= max) break;
    const sx = c.x * opts.scale + opts.tx;
    const sy = c.y * opts.scale + opts.ty;
    const w =
      c.widthPx ??
      Math.max(24, Math.min(160, (c.title?.length ?? 6) * 7));
    // 标签画在节点右侧。
    const x0 = sx + 6;
    const y0 = sy - lineH / 2;
    const x1 = x0 + w;
    const y1 = y0 + lineH;

    let hit = false;
    for (const b of boxes) {
      if (
        x0 < b.x1 + padX &&
        x1 + padX > b.x0 &&
        y0 < b.y1 + padY &&
        y1 + padY > b.y0
      ) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    boxes.push({ x0, y0, x1, y1 });
    out.add(c.id);
  }
  return out;
}

/**
 * 由度数与焦点状态算 priority。
 * 当前/悬停/选中/文本命中/pin/焦点 ≫ 度数。
 */
export function labelPriority(opts: {
  degree: number;
  isCurrent?: boolean;
  isHover?: boolean;
  isSelected?: boolean;
  isTextHit?: boolean;
  isPinned?: boolean;
  isFocus?: boolean;
}): number {
  let p = Math.sqrt(Math.max(0, opts.degree)) * 10;
  if (opts.isFocus) p += 500;
  if (opts.isCurrent) p += 400;
  if (opts.isHover) p += 350;
  if (opts.isSelected) p += 300;
  if (opts.isTextHit) p += 250;
  if (opts.isPinned) p += 150;
  return p;
}

/** 图坐标点转屏坐标(与 GraphView SVG 变换一致)。 */
export function toScreen(
  p: Pt,
  tf: { scale: number; tx: number; ty: number },
): Pt {
  return { x: p.x * tf.scale + tf.tx, y: p.y * tf.scale + tf.ty };
}
