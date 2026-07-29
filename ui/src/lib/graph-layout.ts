/**
 * graph-layout —— 力导向布局的**纯逻辑**(F-GRAPH)。
 *
 * 与 GraphView 解耦:给定节点 id 集合、边弹簧列表、画布尺寸与既有位置 Map,
 * 就地松弛(FR:全对斥力 + 边弹簧 + 向心引力 + 降温)。无 IO、无 React、可单测。
 *
 * 稳定性是核心目标:位置 Map 由调用方持久持有(组件 ref),每次只在结构变化时
 * 增量调和(新增节点就近/螺旋播种、移除节点删除),并以**既有位置为初值**再跑少量迭代。
 * 这样快照更新(自动重建索引)或过滤切换时,已有节点不会乱跳——只在真有结构变化时演化。
 *
 * 算法是经典 Fruchterman–Reingold:斥力 ∝ k²/d、弹簧 ∝ d²/k、向心 0.04、温度指数降温。
 * 复杂度 O(n²·iters);n≤400、iters~120 时数十毫秒内完成,主线程无感。
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
}

/** 默认迭代数(暖启动下足够收敛)。 */
const DEFAULT_ITERS = 120;

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

    // 全对斥力(O(n²))。
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

    // 向心引力 + 温度限幅应用。
    for (let i = 0; i < n; i++) {
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
