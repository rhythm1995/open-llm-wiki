/**
 * graph-modes —— 非力导向布局模式(B-GRAPH-LAYER / B-GRAPH-TIME,纯逻辑)。
 *
 * - force:不在此模块(仍走 graph-layout FR)
 * - type-layer:按 type 分水平带,带内按 id 均匀散布
 * - timeline:按时间戳横轴排布,缺日期落「未知」带
 */
import type { Pt } from "./graph-layout";

export type LayoutMode = "force" | "type-layer" | "timeline";

export const LAYOUT_MODES: LayoutMode[] = ["force", "type-layer", "timeline"];

export function isLayoutMode(s: string): s is LayoutMode {
  return (LAYOUT_MODES as string[]).includes(s);
}

export interface ModeLayoutOpts {
  w: number;
  h: number;
  pad?: number;
  /**
   * type 带顺序;未列出的 type 接在后面按名字排序。
   * null type 用 TYPELESS_LABEL。
   */
  typeOrder?: readonly string[];
}

export const TYPELESS_LABEL = "—";

/**
 * 按 type 水平分层:每层一条 y 带,层内 x 均匀。
 * 就地写入 pos(覆盖)。
 */
export function layoutByTypeLayer(
  ids: readonly number[],
  typeOf: (id: number) => string | null,
  pos: Map<number, Pt>,
  opts: ModeLayoutOpts,
): void {
  const pad = opts.pad ?? 40;
  const w = Math.max(opts.w, pad * 2 + 1);
  const h = Math.max(opts.h, pad * 2 + 1);

  // 收集 type → ids
  const buckets = new Map<string, number[]>();
  for (const id of ids) {
    const t = typeOf(id) ?? TYPELESS_LABEL;
    let arr = buckets.get(t);
    if (!arr) {
      arr = [];
      buckets.set(t, arr);
    }
    arr.push(id);
  }

  const order: string[] = [];
  if (opts.typeOrder) {
    for (const t of opts.typeOrder) {
      if (buckets.has(t)) order.push(t);
    }
  }
  const rest = [...buckets.keys()]
    .filter((t) => !order.includes(t))
    .sort((a, b) => a.localeCompare(b));
  order.push(...rest);

  const nLayers = Math.max(order.length, 1);
  const usableH = h - pad * 2;
  const band = usableH / nLayers;

  for (let li = 0; li < order.length; li++) {
    const key = order[li];
    const members = buckets.get(key) ?? [];
    members.sort((a, b) => a - b);
    const y = pad + band * (li + 0.5);
    const m = members.length;
    for (let i = 0; i < m; i++) {
      const x =
        m === 1
          ? w / 2
          : pad + ((w - pad * 2) * i) / (m - 1);
      pos.set(members[i], { x, y });
    }
  }
}

/**
 * 时间轴:x = 时间归一化,y = 轻微交错防完全重叠。
 * timeMsOf 返回 unix 毫秒;null → 落入右缘「未知」带。
 */
export function layoutByTimeline(
  ids: readonly number[],
  timeMsOf: (id: number) => number | null,
  pos: Map<number, Pt>,
  opts: ModeLayoutOpts,
): void {
  const pad = opts.pad ?? 40;
  const w = Math.max(opts.w, pad * 2 + 1);
  const h = Math.max(opts.h, pad * 2 + 1);

  const known: { id: number; t: number }[] = [];
  const unknown: number[] = [];
  for (const id of ids) {
    const t = timeMsOf(id);
    if (t == null || !Number.isFinite(t)) unknown.push(id);
    else known.push({ id, t });
  }
  known.sort((a, b) => a.t - b.t || a.id - b.id);

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const k of known) {
    if (k.t < tMin) tMin = k.t;
    if (k.t > tMax) tMax = k.t;
  }
  if (!Number.isFinite(tMin)) {
    tMin = 0;
    tMax = 1;
  }
  if (tMax <= tMin) tMax = tMin + 1;

  const span = tMax - tMin;
  const usableW = w - pad * 2;
  // 已知时间占左侧 85%,未知带在右侧。
  const knownW = unknown.length > 0 ? usableW * 0.85 : usableW;
  const midY = h / 2;
  const jitter = Math.min(h * 0.35, 80);

  for (let i = 0; i < known.length; i++) {
    const { id, t } = known[i];
    const u = (t - tMin) / span;
    const x = pad + knownW * u;
    // 交错 y,避免共线。
    const y = midY + ((i % 7) - 3) * (jitter / 3);
    pos.set(id, { x, y: clamp(y, pad, h - pad) });
  }

  // 未知:右侧竖带
  const ux = pad + knownW + (usableW - knownW) / 2;
  unknown.sort((a, b) => a - b);
  for (let i = 0; i < unknown.length; i++) {
    const y =
      unknown.length === 1
        ? midY
        : pad + ((h - pad * 2) * i) / (unknown.length - 1);
    pos.set(unknown[i], { x: ux, y });
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 解析时间:优先 frontmatter created(YYYY-MM-DD…),否则 modified 毫秒。
 */
export function resolveNodeTimeMs(opts: {
  created: string | null | undefined;
  modified: number | null | undefined;
}): number | null {
  const c = opts.created?.trim();
  if (c) {
    // ISO 日期或日期时间
    const ms = Date.parse(c.length === 10 ? `${c}T00:00:00Z` : c);
    if (Number.isFinite(ms)) return ms;
  }
  if (opts.modified != null && opts.modified > 0) return opts.modified;
  return null;
}
