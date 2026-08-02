/**
 * graph-cluster —— 语义聚类键 + 互不撞色调色板(纯函数)。
 *
 * 按文件夹/类型给节点分组,并给每个簇一个颜色,让 canvas 图谱复刻 inkeep 式的
 * 「簇即颜色」可读性。颜色按**首次出现顺序**分配到黄金角色相调色板槽位,
 * 因此当前图里的簇互不撞色(直到簇数超过调色板大小)——比按 key 哈希更稳:
 * 哈希在小集合上会撞色(生日悖论),分配法不会。节点上色与图例共用同一映射,保证一致。
 * 全部原创实现,无 GPL 代码。
 */

export type ClusterMode = "folder" | "type" | "none";

/** 根目录文件的簇键哨兵(与具体目录名不冲突)。 */
const ROOT_SENTINEL = "/";

/**
 * 节点的稳定簇键。
 * - folder:路径所在目录(规范化反斜杠/尾斜杠);根文件 → "/"。
 * - type:类型;null → "—"。
 * - none:空串(不聚类,调用方按类型上色)。
 */
export function nodeClusterKey(
  node: { path: string; type: string | null },
  mode: ClusterMode,
): string {
  if (mode === "type") return node.type ?? "—";
  if (mode === "none") return "";
  const p = node.path.replace(/\\/g, "/").replace(/\/+$/, "");
  const slash = p.lastIndexOf("/");
  if (slash < 0) return ROOT_SENTINEL;
  const dir = p.slice(0, slash);
  return dir.length === 0 ? ROOT_SENTINEL : dir;
}

export interface ClusterEntry {
  key: string;
  count: number;
}

/**
 * 按计数取 top-N 簇,其余并入 overflow。
 * 计数相同按 key 字典序稳定排序。
 */
export function topClusters(
  counts: ReadonlyMap<string, number>,
  limit: number,
): { entries: ClusterEntry[]; overflow: number } {
  const all = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort(
      (a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
  if (limit <= 0) {
    return { entries: [], overflow: all.reduce((s, e) => s + e.count, 0) };
  }
  const top = all.slice(0, limit);
  const overflow = all.slice(limit).reduce((s, e) => s + e.count, 0);
  return { entries: top, overflow };
}

export interface ClusterColor {
  key: string;
  /** 深色主题用色(较高明度)。 */
  dark: string;
  /** 浅色主题用色(较低明度)。 */
  light: string;
}

const DEFAULT_PALETTE_SIZE = 20;

/** 黄金角色相分布,生成 size 个尽量分散的 hsl 颜色(深/浅主题各一)。 */
export function buildClusterPalette(size: number): ClusterColor[] {
  const n = Math.max(1, Math.floor(size));
  const out: ClusterColor[] = [];
  for (let i = 0; i < n; i++) {
    const hue = Math.round((i * 137.508) % 360);
    out.push({
      key: "",
      dark: `hsl(${hue}, 55%, 62%)`,
      light: `hsl(${hue}, 65%, 48%)`,
    });
  }
  return out;
}

/**
 * 按 key 首次出现顺序分配调色板槽位 → 同一批键互不撞色(直到超过 size)。
 * 返回 key→color 映射;节点上色与图例共用此映射,保证一致。
 */
export function assignClusterColors(
  keys: readonly string[],
  size: number = DEFAULT_PALETTE_SIZE,
): Map<string, ClusterColor> {
  const palette = buildClusterPalette(size);
  const out = new Map<string, ClusterColor>();
  let slot = 0;
  for (const k of keys) {
    if (out.has(k)) continue;
    out.set(k, { ...palette[slot % palette.length], key: k });
    slot++;
  }
  return out;
}
