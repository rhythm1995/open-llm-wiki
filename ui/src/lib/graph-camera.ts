/**
 * graph-camera —— 视口与内容包围盒(纯逻辑)。
 *
 * 约束**相机**,不约束节点坐标空间:
 * - 软边界:视口中心钳在内容 bbox 扩张区内,避免拖到全空
 * - 空视口检测:视口与内容无交 → UI 显示「回到图」
 * - ensureVisible:zoomToFit 参数辅助
 */

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CameraState {
  /** 图坐标:视口中心 */
  x: number;
  y: number;
  /** force-graph zoom */
  k: number;
}

/** 从带坐标的节点算内容包围盒;忽略 missing / 无坐标。 */
export function contentBBox(
  nodes: ReadonlyArray<{
    x?: number;
    y?: number;
    r?: number;
    isMissing?: boolean;
  }>,
): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let n = 0;
  for (const node of nodes) {
    if (node.isMissing) continue;
    if (node.x == null || node.y == null) continue;
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
    if (node.x === 0 && node.y === 0) continue; // 未布局占位
    const pad = Math.max(node.r ?? 4, 2);
    minX = Math.min(minX, node.x - pad);
    minY = Math.min(minY, node.y - pad);
    maxX = Math.max(maxX, node.x + pad);
    maxY = Math.max(maxY, node.y + pad);
    n++;
  }
  if (n === 0) return null;
  return { minX, minY, maxX, maxY };
}

/** 按比例扩张 bbox;至少 minPad 图单位。 */
export function expandBBox(b: BBox, frac: number, minPad = 40): BBox {
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const px = Math.max(w * frac, minPad);
  const py = Math.max(h * frac, minPad);
  return {
    minX: b.minX - px,
    minY: b.minY - py,
    maxX: b.maxX + px,
    maxY: b.maxY + py,
  };
}

export function viewportBBox(
  cam: CameraState,
  width: number,
  height: number,
): BBox {
  const k = Math.max(cam.k, 1e-6);
  const halfW = width / 2 / k;
  const halfH = height / 2 / k;
  return {
    minX: cam.x - halfW,
    minY: cam.y - halfH,
    maxX: cam.x + halfW,
    maxY: cam.y + halfH,
  };
}

export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 软边界:把视口中心钳在内容扩张 bbox 内。
 * 视口比内容大时,中心锁到内容中心 → 缩得再开也仍看见图。
 */
export function clampCameraToContent(
  cam: CameraState,
  content: BBox,
  width: number,
  height: number,
  expandFrac = 0.45,
): CameraState {
  // minZoom:略小于「刚好塞进」,允许一点留白,但不能小到整屏空
  const fitK = minZoomToFit(content, width, height, 48);
  const minK = Math.max(0.08, fitK * 0.75);
  const maxK = 4;
  const k = clamp(cam.k, minK, maxK);

  const expanded = expandBBox(content, expandFrac, 60);
  const halfW = width / 2 / Math.max(k, 1e-6);
  const halfH = height / 2 / Math.max(k, 1e-6);
  const cw = expanded.maxX - expanded.minX;
  const ch = expanded.maxY - expanded.minY;
  const cx = (expanded.minX + expanded.maxX) / 2;
  const cy = (expanded.minY + expanded.maxY) / 2;

  let x = cam.x;
  let y = cam.y;
  // 内容比半屏还窄 → 锁中心 x
  if (cw <= halfW * 2) x = cx;
  else x = clamp(cam.x, expanded.minX, expanded.maxX);
  if (ch <= halfH * 2) y = cy;
  else y = clamp(cam.y, expanded.minY, expanded.maxY);

  return { x, y, k };
}

/** 使内容 bbox 完整落入视口所需的 zoom(含 pad 像素)。 */
export function minZoomToFit(
  content: BBox,
  width: number,
  height: number,
  padPx: number,
): number {
  const cw = Math.max(content.maxX - content.minX, 1);
  const ch = Math.max(content.maxY - content.minY, 1);
  const availW = Math.max(width - padPx * 2, 1);
  const availH = Math.max(height - padPx * 2, 1);
  return Math.min(availW / cw, availH / ch);
}

/** 视口内是否完全看不到内容(与内容 bbox 无交)。 */
export function isViewportEmpty(
  cam: CameraState,
  content: BBox | null,
  width: number,
  height: number,
): boolean {
  if (!content) return true;
  if (width <= 0 || height <= 0) return false;
  const view = viewportBBox(cam, width, height);
  return !bboxesIntersect(view, content);
}
