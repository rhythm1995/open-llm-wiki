/**
 * 反链分组 —— 把图谱入边按来源笔记合并(纯逻辑,无 IO)。
 *
 * store 的 backlinks 按边平铺:同一 from 的 wiki + relation 会各占一行。
 * Inspector 用本函数按 from.id 合并,Tab 角标显示篇数而非边数。
 */
import type { EdgeOut, NodeOut } from "./ipc";

export interface BacklinkItem {
  from: NodeOut;
  edge: EdgeOut;
}

export interface GroupedBacklink {
  from: NodeOut;
  /** 有序去重:wiki 固定在 relation 前。 */
  kinds: Array<"wiki" | "relation">;
  /** 该来源的 relation 名,插入序去重。 */
  relations: string[];
  /** 原始边数(徽标数)。 */
  count: number;
}

function kindOrder(kind: "wiki" | "relation"): number {
  return kind === "wiki" ? 0 : 1;
}

/** 按 from.id 合并入边;按 from.title 字典序排序。 */
export function groupBacklinks(backlinks: BacklinkItem[]): GroupedBacklink[] {
  const byFrom = new Map<number, GroupedBacklink>();
  for (const b of backlinks) {
    let g = byFrom.get(b.from.id);
    if (!g) {
      g = { from: b.from, kinds: [], relations: [], count: 0 };
      byFrom.set(b.from.id, g);
    }
    g.count += 1;
    if (!g.kinds.includes(b.edge.kind)) g.kinds.push(b.edge.kind);
    if (b.edge.kind === "relation" && b.edge.relation) {
      if (!g.relations.includes(b.edge.relation)) g.relations.push(b.edge.relation);
    }
  }
  const out = [...byFrom.values()];
  for (const g of out) {
    g.kinds.sort((a, b) => kindOrder(a) - kindOrder(b));
  }
  out.sort((a, b) =>
    a.from.title.localeCompare(b.from.title, undefined, { sensitivity: "base" }),
  );
  return out;
}
