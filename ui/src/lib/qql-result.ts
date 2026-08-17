/**
 * qql-result —— 把 core `ResultSet` 收成 Health 可渲染的扁平行。
 * 不解析 QQL。列名来自 catalog `columns`(Table 行没有表头)。
 */

import type { ResultSet } from "./ipc";

export type ResultNode = { id: number; path: string; title: string };

export type NoteResultRow = {
  id: number;
  path: string | null;
  title: string;
  cells: (string | null)[];
};

export type GroupResultRow = {
  key: string;
  count: number;
  ids: number[];
  dimmed: boolean;
};

export type ResultView =
  | {
      kind: "notes";
      columns: string[];
      rows: NoteResultRow[];
    }
  | {
      kind: "groups";
      rows: GroupResultRow[];
      minCount?: number;
    }
  | { kind: "scalar"; label: "count" | "sum"; value: number }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function emphasizeGroups(
  rows: readonly { key: string; count: number; ids: number[] }[],
  minCount: number,
): GroupResultRow[] {
  return rows.map((r) => ({
    key: r.key,
    count: r.count,
    ids: r.ids,
    dimmed: r.count < minCount,
  }));
}

export function flattenResult(
  rs: ResultSet,
  nodes: readonly ResultNode[],
  columns: string[],
  minCount?: number,
): ResultView {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  if ("List" in rs) {
    if (rs.List.length === 0) return { kind: "empty" };
    return {
      kind: "notes",
      columns: columns.length > 0 ? columns : ["title"],
      rows: rs.List.map((id) => joinNode(id, byId, columns)),
    };
  }
  if ("Table" in rs) {
    if (rs.Table.length === 0) return { kind: "empty" };
    const cols = columns.length > 0 ? columns : ["title"];
    return {
      kind: "notes",
      columns: cols,
      rows: rs.Table.map((row) => {
        const joined = joinNode(row.id, byId, cols);
        const fields = row.fields ?? [];
        joined.cells = cols.map((_, i) =>
          i < fields.length ? fields[i] : null,
        );
        return joined;
      }),
    };
  }
  if ("Groups" in rs) {
    return {
      kind: "groups",
      rows: emphasizeGroups(rs.Groups, minCount ?? 1),
      minCount,
    };
  }
  if ("Histogram" in rs) {
    return {
      kind: "groups",
      rows: emphasizeGroups(rs.Histogram, minCount ?? 1),
      minCount,
    };
  }
  if ("Count" in rs) {
    return { kind: "scalar", label: "count", value: rs.Count };
  }
  if ("Sum" in rs) {
    return { kind: "scalar", label: "sum", value: rs.Sum };
  }
  return { kind: "error", message: "unknown ResultSet" };
}

function joinNode(
  id: number,
  byId: Map<number, ResultNode>,
  columns: string[],
): NoteResultRow {
  const n = byId.get(id);
  if (!n) {
    return {
      id,
      path: null,
      title: `#${id}`,
      cells: columns.map(() => null),
    };
  }
  return {
    id,
    path: n.path,
    title: n.title,
    cells: columns.map((c) =>
      c === "title" ? n.title : c === "path" ? n.path : null,
    ),
  };
}

/** 瓷砖角标:未跑过由 UI 画「—」。 */
export function resultBadge(
  view: ResultView,
  minCount?: number,
): number | "!" {
  switch (view.kind) {
    case "notes":
      return view.rows.length;
    case "groups": {
      const floor = minCount ?? view.minCount ?? 1;
      return view.rows.filter((r) => r.count >= floor).length;
    }
    case "scalar":
      return Math.trunc(view.value);
    case "empty":
      return 0;
    case "error":
      return "!";
  }
}

export function combinedBadge(
  views: readonly ResultView[],
  minCount?: number,
): number | "!" {
  let sum = 0;
  for (const v of views) {
    const b = resultBadge(v, minCount);
    if (b === "!") return "!";
    sum += b;
  }
  return sum;
}
