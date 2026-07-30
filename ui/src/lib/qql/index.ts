/**
 * QQL TS 全量移植入口(B-QQL-TS)。
 * parse → eval;与 openobs-core 语义对齐,供 mock/浏览器。
 */
export type {
  Column,
  Direction,
  FieldRef,
  Literal,
  OrderKey,
  Predicate,
  QqlNote,
  QqlResultSet,
  Query,
  Render,
  Select,
} from "./types";
export { emptyQuery } from "./types";
export { parseQql, QqlParseError } from "./parse";
export { evalQql, matches } from "./eval";

import { parseQql } from "./parse";
import { evalQql } from "./eval";
import type { QqlNote, QqlResultSet } from "./types";

/**
 * 文本查询一步求值。解析失败 → 空 List(与 mock 旧行为兼容,不炸 UI)。
 * 严格模式请自行 parseQql + evalQql。
 */
export function runQqlTs(
  qql: string,
  notes: readonly QqlNote[],
): QqlResultSet {
  const q = qql.trim();
  if (!q) return { List: [] };
  try {
    return evalQql(notes, parseQql(q));
  } catch {
    return { List: [] };
  }
}
