/**
 * graph-canvas-labels —— canvas 标签芯片的避让规划(纯函数,图空间)。
 *
 * canvas 渲染器的 nodeCanvasObject 在**图空间**(ctx 已按 globalScale 平移缩放)里绘制,
 * 所以芯片几何用图坐标。文本仍按**屏像素**测量(注入 measure,便于单测),再除以 scale
 * 折算到图空间。碰撞检测在图空间进行——均匀缩放/平移保持 AABB 重叠拓扑不变,故等价于
 * 屏幕碰撞:scale 越大(放大)→ 图空间盒越小 → 越多标签放得下。
 *
 * 复用 graph-label 的 labelPriority 做优先级;冲突时高优先级先占,低优先级丢弃。
 */
import { labelPriority } from "./graph-label";

export interface CanvasLabelCandidate {
  id: number;
  /** 图坐标(节点中心)。 */
  x: number;
  y: number;
  title?: string;
  /** 已算好的优先级;缺省由下方状态经 labelPriority 推导。 */
  priority?: number;
  degree?: number;
  isCurrent?: boolean;
  isHover?: boolean;
  isSelected?: boolean;
  isTextHit?: boolean;
  isPinned?: boolean;
  isFocus?: boolean;
  /** 节点半径(屏像素),用于芯片与节点的留白。缺省 5。 */
  radius?: number;
}

export interface CanvasLabelPlacement {
  id: number;
  /** 可能被截断过的文本。 */
  text: string;
  /** 图坐标芯片盒(nodeCanvasObject 直接绘制)。 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CanvasLabelPlanOpts {
  /** rfg globalScale(k):文本按屏像素测量,尺寸除以 k 折算到图空间。 */
  scale: number;
  /** 文本宽度测量(ctx.measureText 注入,屏像素)。 */
  measure: (text: string) => number;
  maxLabels?: number;
  /** 芯片高(屏像素)。 */
  chipHeight?: number;
  /** 芯片内左右留白(屏像素)。 */
  padX?: number;
  /** 节点边缘 → 芯片的水平间距(屏像素)。 */
  gapX?: number;
  /** 芯片最小宽(屏像素)。 */
  minChipWidth?: number;
}

/** 芯片最大宽(屏像素),超出则截断。 */
const MAX_CHIP_WIDTH = 180;

/** 贪心优先级标签规划,返回图空间芯片盒。 */
export function planCanvasLabels(
  candidates: readonly CanvasLabelCandidate[],
  opts: CanvasLabelPlanOpts,
): CanvasLabelPlacement[] {
  const k = opts.scale > 0 ? opts.scale : 1;
  const chipH = opts.chipHeight ?? 16;
  const padX = opts.padX ?? 8;
  const gapX = opts.gapX ?? 6;
  const minW = opts.minChipWidth ?? 24;
  const max =
    opts.maxLabels && opts.maxLabels > 0 ? opts.maxLabels : Infinity;

  const ranked = [...candidates]
    .map((c) => ({
      c,
      pri:
        c.priority ??
        labelPriority({
          degree: c.degree ?? 0,
          isCurrent: c.isCurrent,
          isHover: c.isHover,
          isSelected: c.isSelected,
          isTextHit: c.isTextHit,
          isPinned: c.isPinned,
          isFocus: c.isFocus,
        }),
    }))
    .sort((a, b) => b.pri - a.pri || a.c.id - b.c.id);

  const placed: CanvasLabelPlacement[] = [];

  for (const { c } of ranked) {
    if (placed.length >= max) break;
    const title = c.title ?? "";

    let text = title;
    let chipW = Math.max(minW, opts.measure(title) + padX * 2);
    if (chipW > MAX_CHIP_WIDTH) {
      chipW = MAX_CHIP_WIDTH;
      const avail = chipW - padX * 2;
      if (opts.measure(text) > avail) {
        // 二分找最大可放字符数,末尾补省略号。
        let lo = 0;
        let hi = text.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (opts.measure(text.slice(0, mid) + "…") <= avail) lo = mid;
          else hi = mid - 1;
        }
        text = (lo > 0 ? text.slice(0, lo) : "") + "…";
      }
    }

    const radius = c.radius ?? 5;
    const x0 = c.x + (radius + gapX) / k;
    const y0 = c.y - chipH / (2 * k);
    const x1 = x0 + chipW / k;
    const y1 = y0 + chipH / k;

    let hit = false;
    for (const b of placed) {
      if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    placed.push({ id: c.id, text, x0, y0, x1, y1 });
  }
  return placed;
}
