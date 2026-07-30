/**
 * QQL AST —— 对齐 openobs-core `query` 模块(纯结构,IO-free)。
 * TS 移植供 mock / 浏览器 dev 全量求值;真机桌面仍可走 Rust。
 */

export type Literal =
  | { kind: "str"; value: string }
  | { kind: "int"; value: number }
  | { kind: "bool"; value: boolean };

export type Cmp = "eq" | "ne" | "gt" | "ge" | "lt" | "le";

export type LenSrc =
  | { kind: "tags" }
  | { kind: "backlinks" }
  | { kind: "links" }
  | { kind: "keyList"; key: string };

export type FieldRef =
  | { kind: "title" }
  | { kind: "body" }
  | { kind: "path" }
  | { kind: "type" }
  | { kind: "key"; key: string }
  | { kind: "len"; src: LenSrc };

export type Predicate =
  | { kind: "all" }
  | { kind: "hasTag"; tag: string }
  | { kind: "hasField"; field: FieldRef }
  | { kind: "cmp"; field: FieldRef; op: Cmp; lit: Literal }
  | { kind: "contains"; field: FieldRef; needle: string }
  | { kind: "startsWith"; field: FieldRef; prefix: string }
  | { kind: "endsWith"; field: FieldRef; suffix: string }
  | { kind: "inList"; field: FieldRef; list: string[] }
  | { kind: "not"; inner: Predicate }
  | { kind: "and"; preds: Predicate[] }
  | { kind: "or"; preds: Predicate[] };

export type Direction = "asc" | "desc";

export interface OrderKey {
  field: FieldRef;
  dir: Direction;
}

export type Column = { field: FieldRef; alias: string | null };

export type Select =
  | { kind: "notes" }
  | { kind: "fields"; cols: Column[] };

export type Render =
  | { kind: "list" }
  | { kind: "table" }
  | { kind: "count" }
  | { kind: "groupBy"; field: FieldRef }
  | { kind: "sum"; field: FieldRef }
  | { kind: "histogram"; field: FieldRef };

export interface Query {
  filter: Predicate;
  order: OrderKey[];
  limit: number | null;
  select: Select;
  render: Render;
}

export function emptyQuery(): Query {
  return {
    filter: { kind: "all" },
    order: [],
    limit: null,
    select: { kind: "notes" },
    render: { kind: "list" },
  };
}

/** 求值输入笔记(与 core Note 投影对齐的最小集)。 */
export interface QqlNote {
  id: number;
  path: string;
  title: string;
  body: string;
  /** frontmatter 标量/列表(已扁平为 string | number | boolean | string[])。 */
  frontmatter: Record<string, unknown>;
  tags: string[];
  type: string | null;
  /** 入度(反链数)。 */
  backlinkCount: number;
  /** 出度(wikilink 出边)。 */
  linkCount: number;
}

/** 与前端 ipc.ResultSet 同形(serde 外标签)。 */
export type QqlResultSet =
  | { List: number[] }
  | { Table: { id: number; fields: (string | null)[] | null }[] }
  | { Count: number }
  | { Groups: { key: string; count: number; ids: number[] }[] }
  | { Sum: number }
  | { Histogram: { key: string; count: number; ids: number[] }[] };
