/**
 * graph-layout —— 力导向布局的**纯逻辑**(F-GRAPH)。
 *
 * 与 GraphView 解耦:给定节点 id 集合、边弹簧列表、画布尺寸与既有位置 Map,
 * 就地松弛(FR:斥力 + 边弹簧 + 向心 + 降温)。无 IO、无 React、可单测。
 *
 * 稳定性:位置 Map 由调用方持久持有,结构变化时增量播种 + 暖启动。
 *
 * 斥力:
 *   - n < BARNES_HUT_THRESHOLD → 全对 O(n²)
 *   - 否则 Barnes–Hut 四叉树 O(n log n)(theta≈0.8)
 * 弹簧仍 O(e)。
 */
export interface Pt {
  x: number;
  y: number;
}

/** 一条弹簧(无向),两端 id 都必须在 pos 里。 */
export interface Spring {
  from: number;
  to: number;
}

export interface LayoutOptions {
  /** 画布宽(viewBox 单位)。 */
  w: number;
  /** 画布高。 */
  h: number;
  /** 松弛迭代数。 */
  iterations?: number;
  /** 边界留白(节点中心被夹在 [pad, w-pad] × [pad, h-pad])。 */
  pad?: number;
  /** 钉住的节点 id:位置不随力导向移动(拖拽固定 / 用户 pin)。 */
  pinned?: ReadonlySet<number>;
  /**
   * 斥力模式。默认 `auto`:n≥BARNES_HUT_THRESHOLD 用 Barnes-Hut,否则全对。
   */
  repulsion?: "auto" | "exact" | "barnes-hut";
  /** Barnes-Hut 开角阈值(越小越准越慢)。默认 0.8。 */
  barnesHutTheta?: number;
}

/** 默认迭代数(暖启动下足够收敛)。 */
const DEFAULT_ITERS = 120;
/** 超过此规模默认走 Barnes-Hut。 */
export const BARNES_HUT_THRESHOLD = 280;

/**
 * 把 `ids` 中不在 `pos` 里的节点播种:优先落在已定位的邻居附近(小幅抖动),
 * 否则绕画布中心螺旋分布。播种用 `rand`(0..1 注入,便于测试确定性)。
 */
export function seedNodes(
  ids: number[],
  neighbors: Map<number, number[]>,
  pos: Map<number, Pt>,
  opts: LayoutOptions,
  rand: () => number = Math.random,
): void {
  const { w, h } = opts;
  const cx = w / 2;
  const cy = h / 2;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (pos.has(id)) continue;
    // 找一个已定位的邻居,贴在它附近(加抖动),新节点自然成簇。
    const ns = neighbors.get(id);
    let anchor: Pt | null = null;
    if (ns) {
      for (const n of ns) {
        const p = pos.get(n);
        if (p) {
          anchor = p;
          break;
        }
      }
    }
    if (anchor) {
      pos.set(id, {
        x: anchor.x + (rand() - 0.5) * 40,
        y: anchor.y + (rand() - 0.5) * 40,
      });
    } else {
      // 螺旋:避免重合,半径随已播种数增长。
      const a = i * 2.399963; // 黄金角,分布均匀
      const r = 18 + Math.sqrt(i) * 22;
      pos.set(id, {
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
      });
    }
  }
}

/** 四叉树节点(Barnes-Hut)。mass=子树点数,cx/cy=质心。 */
interface QuadNode {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  mass: number;
  cx: number;
  cy: number;
  /** 叶子上的点下标;内部节点为 -1。 */
  body: number;
  children: QuadNode[] | null;
}

function quadNew(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): QuadNode {
  return {
    minX,
    minY,
    maxX,
    maxY,
    mass: 0,
    cx: 0,
    cy: 0,
    body: -1,
    children: null,
  };
}

function childIndex(node: QuadNode, x: number, y: number): number {
  const mx = (node.minX + node.maxX) / 2;
  const my = (node.minY + node.maxY) / 2;
  let qi = 0;
  if (x >= mx) qi += 1;
  if (y >= my) qi += 2;
  return qi;
}

function splitNode(node: QuadNode): void {
  const mx = (node.minX + node.maxX) / 2;
  const my = (node.minY + node.maxY) / 2;
  node.children = [
    quadNew(node.minX, node.minY, mx, my),
    quadNew(mx, node.minY, node.maxX, my),
    quadNew(node.minX, my, mx, node.maxY),
    quadNew(mx, my, node.maxX, node.maxY),
  ];
  node.body = -1;
}

function recomputeMass(node: QuadNode): void {
  if (!node.children) return;
  let mass = 0;
  let cx = 0;
  let cy = 0;
  for (const c of node.children) {
    if (c.mass === 0) continue;
    mass += c.mass;
    cx += c.cx * c.mass;
    cy += c.cy * c.mass;
  }
  node.mass = mass;
  if (mass > 0) {
    node.cx = cx / mass;
    node.cy = cy / mass;
  }
}

function quadInsert(
  node: QuadNode,
  i: number,
  px: Float64Array,
  py: Float64Array,
  depth: number,
): void {
  // 内部节点:下沉到象限,再汇总质心。
  if (node.children) {
    const qi = childIndex(node, px[i], py[i]);
    quadInsert(node.children[qi], i, px, py, depth + 1);
    recomputeMass(node);
    return;
  }

  // 空叶子。
  if (node.mass === 0) {
    node.body = i;
    node.mass = 1;
    node.cx = px[i];
    node.cy = py[i];
    return;
  }

  // 深度上限:合并为多粒子叶子(质心平均)。
  if (depth > 28) {
    node.mass += 1;
    node.cx += (px[i] - node.cx) / node.mass;
    node.cy += (py[i] - node.cy) / node.mass;
    return;
  }

  // 占用叶子 → 分裂,旧点与新点都下沉。
  const old = node.body;
  splitNode(node);
  node.mass = 0;
  node.cx = 0;
  node.cy = 0;
  if (old >= 0) {
    const qiOld = childIndex(node, px[old], py[old]);
    quadInsert(node.children![qiOld], old, px, py, depth + 1);
  }
  const qiNew = childIndex(node, px[i], py[i]);
  quadInsert(node.children![qiNew], i, px, py, depth + 1);
  recomputeMass(node);
}

function buildQuadTree(
  px: Float64Array,
  py: Float64Array,
  n: number,
  pad: number,
): QuadNode | null {
  if (n === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (px[i] < minX) minX = px[i];
    if (py[i] < minY) minY = py[i];
    if (px[i] > maxX) maxX = px[i];
    if (py[i] > maxY) maxY = py[i];
  }
  // 正方形包围,避免扁矩形象限失真。
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const side = Math.max(dx, dy) + pad * 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const root = quadNew(cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2);
  for (let i = 0; i < n; i++) quadInsert(root, i, px, py, 0);
  return root;
}

/**
 * 对 body i 施加 Barnes-Hut 近似斥力(FR: f = k²/d² 沿方向)。
 * 远簇用质心*质量;近簇或叶子精确到 body(跳过自身)。
 */
function bhAccumulate(
  node: QuadNode,
  i: number,
  px: Float64Array,
  py: Float64Array,
  dispX: Float64Array,
  dispY: Float64Array,
  k2: number,
  theta: number,
): void {
  if (node.mass === 0) return;
  // 单粒子叶子且是自己。
  if (node.children == null && node.body === i && node.mass === 1) return;

  const xi = px[i];
  const yi = py[i];
  let dx = xi - node.cx;
  let dy = yi - node.cy;
  let d2 = dx * dx + dy * dy;
  if (d2 < 0.01) {
    d2 = 0.01;
    dx = 0.01;
    dy = 0.01;
  }
  const dist = Math.sqrt(d2);
  const size = Math.max(node.maxX - node.minX, node.maxY - node.minY);
  const isLeaf = node.children == null;

  // s/d < theta → 整簇近似。
  if (isLeaf || size / dist < theta) {
    if (isLeaf && node.body === i && node.mass === 1) return;
    // 多粒子叶子含自身:减 1 质量近似(足够稳)。
    let mass = node.mass;
    if (isLeaf && node.body === i) mass = Math.max(0, mass - 1);
    if (mass <= 0) return;
    const f = (k2 / d2) * mass;
    dispX[i] += (dx / dist) * f;
    dispY[i] += (dy / dist) * f;
    return;
  }
  for (const c of node.children!) {
    bhAccumulate(c, i, px, py, dispX, dispY, k2, theta);
  }
}

function applyExactRepulsion(
  n: number,
  px: Float64Array,
  py: Float64Array,
  dispX: Float64Array,
  dispY: Float64Array,
  k2: number,
): void {
  for (let i = 0; i < n; i++) {
    const xi = px[i];
    const yi = py[i];
    for (let j = i + 1; j < n; j++) {
      let dx = xi - px[j];
      let dy = yi - py[j];
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        d2 = 0.01;
        dx = (i - j) * 0.5 + 0.01;
        dy = (i - j) * 0.3 + 0.01;
      }
      const dist = Math.sqrt(d2);
      const f = k2 / d2;
      const ux = (dx / dist) * f;
      const uy = (dy / dist) * f;
      dispX[i] += ux;
      dispY[i] += uy;
      dispX[j] -= ux;
      dispY[j] -= uy;
    }
  }
}

/**
 * 就地松弛 `pos`(键为节点 id)。只处理 `ids` 列出的节点;弹簧两端须都在 pos 内。
 * 以既有位置为初值,故调用方持久持有 pos 即可获得跨帧稳定性。
 */
export function relaxLayout(
  ids: number[],
  springs: Spring[],
  pos: Map<number, Pt>,
  opts: LayoutOptions,
): void {
  const n = ids.length;
  if (n === 0) return;
  const { w, h } = opts;
  const iters = opts.iterations ?? DEFAULT_ITERS;
  const pad = opts.pad ?? 18;
  const cx = w / 2;
  const cy = h / 2;
  const k = Math.sqrt((w * h) / n) * 0.8;
  const k2 = k * k;
  const mode = opts.repulsion ?? "auto";
  const useBh =
    mode === "barnes-hut" ||
    (mode === "auto" && n >= BARNES_HUT_THRESHOLD);
  const theta = opts.barnesHutTheta ?? 0.8;

  // id → 在 ids 数组里的下标,用于 O(1) 取排布点。
  const idxOf = new Map<number, number>();
  for (let i = 0; i < n; i++) idxOf.set(ids[i], i);
  // 仅保留两端都在 ids 的弹簧。
  const activeSprings = springs.filter(
    (s) => idxOf.has(s.from) && idxOf.has(s.to),
  );

  let temp = Math.max(w, h) * 0.12;
  const dispX = new Float64Array(n);
  const dispY = new Float64Array(n);
  // 缓存当前坐标到 TypedArray,加速内层循环(避免 Map 查询)。
  const px = new Float64Array(n);
  const py = new Float64Array(n);

  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const p = pos.get(ids[i])!;
      px[i] = p.x;
      py[i] = p.y;
      dispX[i] = 0;
      dispY[i] = 0;
    }

    if (useBh) {
      const tree = buildQuadTree(px, py, n, pad);
      if (tree) {
        for (let i = 0; i < n; i++) {
          bhAccumulate(tree, i, px, py, dispX, dispY, k2, theta);
        }
      }
    } else {
      applyExactRepulsion(n, px, py, dispX, dispY, k2);
    }

    // 边弹簧(吸引力)。
    for (const s of activeSprings) {
      const a = idxOf.get(s.from)!;
      const b = idxOf.get(s.to)!;
      let dx = px[a] - px[b];
      let dy = py[a] - py[b];
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) {
        dist = 0.01;
        dx = 0.01;
        dy = 0.01;
      }
      const f = (dist * dist) / k;
      const ux = (dx / dist) * f;
      const uy = (dy / dist) * f;
      dispX[a] -= ux;
      dispY[a] -= uy;
      dispX[b] += ux;
      dispY[b] += uy;
    }

    // 向心引力 + 温度限幅应用;钉住节点跳过位移。
    const pinned = opts.pinned;
    for (let i = 0; i < n; i++) {
      if (pinned?.has(ids[i])) continue;
      let dx = dispX[i] + (cx - px[i]) * 0.04;
      let dy = dispY[i] + (cy - py[i]) * 0.04;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const lim = Math.min(d, temp);
      const nx = px[i] + (dx / d) * lim;
      const ny = py[i] + (dy / d) * lim;
      pos.set(ids[i], {
        x: Math.max(pad, Math.min(w - pad, nx)),
        y: Math.max(pad, Math.min(h - pad, ny)),
      });
    }
    temp *= 0.985;
  }
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
 * 内的节点 id 集合(graph 坐标 → 屏幕:`sx = x·scale + tx`)。供大图渲染前裁掉屏外节点,
 * 降低 SVG DOM 量。位置缺失的节点不计入。`margin` 为屏幕像素留白,平移时减少边缘 pop-in。
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
