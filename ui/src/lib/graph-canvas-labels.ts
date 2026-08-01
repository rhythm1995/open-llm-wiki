/**
 * graph-canvas-labels —— canvas 标签芯片的避让规划(纯函数,图空间)。
 *
 * canvas 渲染器的 nodeCanvasObject 在**图空间**(ctx 已按 globalScale 平移缩放)里绘制,
 * 所以芯片几何用图坐标。文本仍按**屏像素**测量(注入 measure,便于单测),再除以 scale
 * 折算到图空间。碰撞检测在图空间进行——均匀缩放/平移保持 AABB 重叠拓扑不变,故等价于
 * 屏幕碰撞:scale 越大(放大)→ 图空间盒越小 → 越多标签放得下。
 *
 * 排序(决定谁在 maxLabels 预算下存活,借鉴 inkeep 的分层语义、自行实现):
 *   焦点状态(current/focus)≫ 悬停/选中/pin ≫ 离视口中心近 ≫ 度数大 ≫ priority ≫ id。
 * 每个候选试 4 个锚点(右/下/上/左),取首个**既不与已放标签重叠、也不盖其他节点圆**
 * 的位置;四处都冲突则丢弃。避让节点圆用最近点-圆心距离判定,带 AABB 粗剪枝。
 *
 * 复用 graph-label 的 labelPriority 做数值优先级(作为排序的较低位 tiebreaker)。
 */
import { labelPriority } from "./graph-label";

export interface CanvasLabelCandidate {
  id: number;
  /** 图坐标(节点中心)。 */
  x: number;
  y: number;
  title?: string;
  /** 显式优先级;缺省由状态经 labelPriority 推导(作低位 tiebreaker)。 */
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

export type CanvasLabelAnchor = "right" | "bottom" | "top" | "left";

export interface CanvasLabelPlacement {
  id: number;
  /** 可能被截断过的文本。 */
  text: string;
  /** 图坐标芯片盒(nodeCanvasObject 直接绘制)。 */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 命中的锚点(便于调试;绘制只看 x0/y0/x1/y1)。 */
  anchor: CanvasLabelAnchor;
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
  /** 节点边缘 → 芯片的间距(屏像素)。 */
  gapX?: number;
  /** 芯片最小宽(屏像素)。 */
  minChipWidth?: number;
  /** 图空间视口中心;离它近的候选优先(画面中央先有标签)。缺省不按距离排序。 */
  viewportCenter?: { x: number; y: number } | null;
  /** 参与避让的节点(标签矩形不得盖其圆)。缺省不避让节点圆。 */
  nodes?: ReadonlyArray<{ id: number; x: number; y: number; radius: number }>;
  /** 避让节点圆的额外留白(图空间)。 */
  nodeAvoidPad?: number;
}

/** 芯片最大宽(屏像素),超出则截断。 */
const MAX_CHIP_WIDTH = 180;
/** 避让节点圆时的图空间粗剪枝半径(覆盖最大节点半径 + 余量)。 */
const AVOID_SPAN = 48;

/**
 * 贪心优先级标签规划,返回图空间芯片盒。4 锚点摆位 + 避让已放标签 + 避让节点圆。
 */
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
  const center = opts.viewportCenter ?? null;
  const avoidNodes = opts.nodes ?? null;
  const avoidPad = opts.nodeAvoidPad ?? 0;

  // 1) 计算每个候选的文本 / 芯片宽 / 排序键。
  interface Prepped {
    c: CanvasLabelCandidate;
    text: string;
    chipW: number;
    tier: number;
    dist: number;
    pri: number;
    deg: number;
  }
  const prepped: Prepped[] = [];
  for (const c of candidates) {
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
    // tier:焦点/交互状态的高位桶,确保 current/focus/hover 必然先于普通节点。
    const tier =
      (c.isCurrent || c.isFocus ? 64 : 0) |
      (c.isHover ? 32 : 0) |
      (c.isSelected ? 16 : 0) |
      (c.isPinned ? 8 : 0) |
      (c.isTextHit ? 4 : 0);
    const dist = center
      ? Math.hypot(c.x - center.x, c.y - center.y)
      : 0;
    const pri =
      c.priority ??
      labelPriority({
        degree: c.degree ?? 0,
        isCurrent: c.isCurrent,
        isHover: c.isHover,
        isSelected: c.isSelected,
        isTextHit: c.isTextHit,
        isPinned: c.isPinned,
        isFocus: c.isFocus,
      });
    prepped.push({ c, text, chipW, tier, dist, pri, deg: c.degree ?? 0 });
  }

  // 排序:tier 降序 → 离中心近(升序)→ priority 降序 → 度数降序 → id 升序。
  prepped.sort(
    (a, b) =>
      b.tier - a.tier ||
      a.dist - b.dist ||
      b.pri - a.pri ||
      b.deg - a.deg ||
      a.c.id - b.c.id,
  );

  // 2) 贪心摆位:4 锚点,避让已放标签 + 节点圆。
  const placed: CanvasLabelPlacement[] = [];
  for (const item of prepped) {
    if (placed.length >= max) break;
    const { c, text, chipW } = item;
    const radius = c.radius ?? 5;
    const wG = chipW / k;
    const hG = chipH / k;
    const rG = radius / k;
    const gapG = gapX / k;
    const anchors: { name: CanvasLabelAnchor; ax: number; ay: number }[] = [
      { name: "right", ax: c.x + rG + gapG, ay: c.y - hG / 2 },
      { name: "bottom", ax: c.x - wG / 2, ay: c.y + rG + gapG },
      { name: "top", ax: c.x - wG / 2, ay: c.y - rG - gapG - hG },
      { name: "left", ax: c.x - rG - gapG - wG, ay: c.y - hG / 2 },
    ];

    let chosen:
      | { x0: number; y0: number; x1: number; y1: number; anchor: CanvasLabelAnchor }
      | null = null;
    for (const a of anchors) {
      const box = { x0: a.ax, y0: a.ay, x1: a.ax + wG, y1: a.ay + hG };

      // a) 与已放标签 AABB 重叠?
      let bad = false;
      for (const b of placed) {
        if (
          box.x0 < b.x1 &&
          box.x1 > b.x0 &&
          box.y0 < b.y1 &&
          box.y1 > b.y0
        ) {
          bad = true;
          break;
        }
      }
      if (bad) continue;

      // b) 盖其他节点的圆?(带 AABB 粗剪枝)
      if (avoidNodes) {
        const cx = (box.x0 + box.x1) / 2;
        const cy = (box.y0 + box.y1) / 2;
        const spanX = wG / 2 + AVOID_SPAN;
        const spanY = hG / 2 + AVOID_SPAN;
        for (const n of avoidNodes) {
          if (n.id === c.id) continue;
          if (Math.abs(n.x - cx) > spanX || Math.abs(n.y - cy) > spanY)
            continue;
          const nr = (n.radius ?? 5) / k + avoidPad;
          if (rectIntersectsCircle(box.x0, box.y0, box.x1, box.y1, n.x, n.y, nr)) {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;

      chosen = { ...box, anchor: a.name };
      break;
    }
    if (!chosen) continue;
    placed.push({
      id: c.id,
      text,
      x0: chosen.x0,
      y0: chosen.y0,
      x1: chosen.x1,
      y1: chosen.y1,
      anchor: chosen.anchor,
    });
  }
  return placed;
}

/** 矩形与圆是否相交(矩形边到圆心最近点距 < 半径)。 */
function rectIntersectsCircle(
  rx0: number,
  ry0: number,
  rx1: number,
  ry1: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const nx = cx < rx0 ? rx0 : cx > rx1 ? rx1 : cx;
  const ny = cy < ry0 ? ry0 : cy > ry1 ? ry1 : cy;
  return Math.hypot(cx - nx, cy - ny) < r;
}
