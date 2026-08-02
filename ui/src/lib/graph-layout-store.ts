/**
 * graph-layout-store —— 布局坐标**落盘**的纯逻辑(B-GRAPH-POS-PERSIST)。
 *
 * 内存级「位置 Map 跨帧持久 + 暖启动」已存在(GraphView posRef + graph-layout);
 * 本模块只负责**磁盘序列化 / 反序列化 / 合流**:
 *   - 序列化按 **path**(文件真相),不按数值 id——跨 reindex / id 重排仍稳。
 *   - 反序列化时丢弃 path 已不存在的键(drop-orphan)。
 *   - 与暖启动合流:stored 覆盖已知 id,warm 填充其余(同一坐标源,避免双写抖动)。
 *
 * 无 IO、无 DOM;读写 localStorage / vault 文件由调用方(GraphView + ipc 薄壳)负责。
 */
import type { Pt } from "./graph-layout";
import { pathKey } from "./graph-model";

/** 落盘布局的稳定 schema(version 便于未来迁移)。 */
export interface StoredLayout {
  v: 1;
  /** pathKey → 坐标(viewBox 单位)。 */
  positions: Record<string, { x: number; y: number }>;
  /** 落盘时的画布尺寸(参考;非权威,恢复时仅作种子)。 */
  w?: number;
  h?: number;
}

export const LAYOUT_STORE_VERSION = 1;

/**
 * 把内存 pos(id→Pt)序列化为可落盘结构。
 * `idToPath` 返回 null/undefined 的节点被丢弃(无稳定主键,不应落盘)。
 */
export function serializePositions(
  pos: ReadonlyMap<number, Pt>,
  idToPath: (id: number) => string | null | undefined,
  opts?: { w?: number; h?: number },
): StoredLayout {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of pos) {
    const raw = idToPath(id);
    if (raw == null) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    positions[pathKey(raw)] = { x: p.x, y: p.y };
  }
  const out: StoredLayout = { v: LAYOUT_STORE_VERSION, positions };
  if (opts && Number.isFinite(opts.w)) out.w = opts.w;
  if (opts && Number.isFinite(opts.h)) out.h = opts.h;
  return out;
}

/**
 * 从落盘结构恢复 id→Pt。
 * `pathToId` 返回 null/undefined 的键被丢弃(path 已不存在 = drop-orphan)。
 * 非法输入(类型错乱 / 缺字段)→ 返回空 Map,绝不抛。
 */
export function deserializePositions(
  data: unknown,
  pathToId: (path: string) => number | null | undefined,
): Map<number, Pt> {
  const out = new Map<number, Pt>();
  if (!isStoredLayout(data)) return out;
  for (const [path, pt] of Object.entries(data.positions)) {
    if (!pt || typeof pt !== "object") continue;
    const x = (pt as { x?: unknown }).x;
    const y = (pt as { y?: unknown }).y;
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const id = pathToId(path);
    if (id == null) continue;
    out.set(id, { x, y });
  }
  return out;
}

function isStoredLayout(data: unknown): data is StoredLayout {
  if (!data || typeof data !== "object") return false;
  const d = data as { v?: unknown; positions?: unknown };
  return d.v === LAYOUT_STORE_VERSION && !!d.positions && typeof d.positions === "object";
}

/**
 * 合流暖启动与落盘恢复:**stored 覆盖已知 id,warm 填充其余**。
 * 返回新 Map(不修改入参)。GraphView 在首帧布局前把 stored 写进 posRef。
 */
export function mergePositions(
  warm: ReadonlyMap<number, Pt>,
  stored: ReadonlyMap<number, Pt>,
): Map<number, Pt> {
  const out = new Map<number, Pt>(warm);
  for (const [id, p] of stored) out.set(id, { x: p.x, y: p.y });
  return out;
}

/** 序列化为 JSON 字符串;异常 → null(调用方静默跳过落盘)。 */
export function serializeLayoutJson(layout: StoredLayout): string | null {
  try {
    return JSON.stringify(layout);
  } catch {
    return null;
  }
}

/**
 * 反序列化 JSON 字符串为 id→Pt。
 * null / 空 / 非法 JSON / 非 StoredLayout → 空 Map(绝不抛)。
 */
export function parseLayoutJson(
  json: string | null | undefined,
  pathToId: (path: string) => number | null | undefined,
): Map<number, Pt> {
  if (!json) return new Map();
  try {
    return deserializePositions(JSON.parse(json), pathToId);
  } catch {
    return new Map();
  }
}
