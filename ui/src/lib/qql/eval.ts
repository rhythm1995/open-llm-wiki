/**
 * QQL 求值(layer 2):Query AST → ResultSet。
 * 对齐 core/src/query.rs(大小写不敏感字符串比较;缺失字段排序末尾)。
 */
import type {
  Cmp,
  FieldRef,
  Literal,
  Predicate,
  QqlNote,
  QqlResultSet,
  Query,
} from "./types";

type FVal =
  | { k: "str"; v: string }
  | { k: "num"; v: number }
  | { k: "bool"; v: boolean }
  | { k: "list"; v: string[] }
  | { k: "missing" };

function formatNum(x: number): string {
  if (Number.isFinite(x) && Math.floor(x) === x) return String(x);
  return String(x);
}

function fieldValue(rf: FieldRef, n: QqlNote): FVal {
  switch (rf.kind) {
    case "title":
      return { k: "str", v: n.title };
    case "body":
      return { k: "str", v: n.body };
    case "path":
      return { k: "str", v: n.path };
    case "type":
      return n.type != null ? { k: "str", v: n.type } : { k: "missing" };
    case "key": {
      const raw = n.frontmatter[rf.key];
      if (raw === undefined || raw === null) return { k: "missing" };
      if (typeof raw === "string") return { k: "str", v: raw };
      if (typeof raw === "number") return { k: "num", v: raw };
      if (typeof raw === "boolean") return { k: "bool", v: raw };
      if (Array.isArray(raw)) return { k: "list", v: raw.map(String) };
      return { k: "missing" };
    }
    case "len": {
      let len = 0;
      switch (rf.src.kind) {
        case "tags":
          len = n.tags.length;
          break;
        case "backlinks":
          len = n.backlinkCount;
          break;
        case "links":
          len = n.linkCount;
          break;
        case "keyList": {
          const raw = n.frontmatter[rf.src.key];
          len = Array.isArray(raw) ? raw.length : 0;
          break;
        }
      }
      return { k: "num", v: len };
    }
  }
}

function projectStr(rf: FieldRef, n: QqlNote): string | null {
  const v = fieldValue(rf, n);
  switch (v.k) {
    case "missing":
      return null;
    case "str":
      return v.v;
    case "num":
      return formatNum(v.v);
    case "bool":
      return String(v.v);
    case "list":
      return v.v.join(", ");
  }
}

function cmpEval(v: FVal, op: Cmp, lit: Literal): boolean {
  if (v.k === "missing") return op === "ne";
  let ord: number | null = null;
  if (v.k === "str" && lit.kind === "str") {
    const a = v.v.toLowerCase();
    const b = lit.value.toLowerCase();
    ord = a < b ? -1 : a > b ? 1 : 0;
  } else if (v.k === "num" && lit.kind === "int") {
    ord = v.v < lit.value ? -1 : v.v > lit.value ? 1 : 0;
  } else if (v.k === "bool" && lit.kind === "bool") {
    ord = v.v === lit.value ? 0 : v.v ? 1 : -1;
  }
  if (ord == null) return op === "ne";
  switch (op) {
    case "eq":
      return ord === 0;
    case "ne":
      return ord !== 0;
    case "gt":
      return ord > 0;
    case "ge":
      return ord >= 0;
    case "lt":
      return ord < 0;
    case "le":
      return ord <= 0;
  }
}

function containsEval(v: FVal, needle: string): boolean {
  if (!needle) return true;
  const nl = needle.toLowerCase();
  if (v.k === "str") return v.v.toLowerCase().includes(nl);
  if (v.k === "list") return v.v.some((it) => it.toLowerCase().includes(nl));
  return false;
}

function prefixEval(v: FVal, affix: string, start: boolean): boolean {
  if (!affix) return true;
  const a = affix.toLowerCase();
  const check = (s: string) => {
    const sl = s.toLowerCase();
    return start ? sl.startsWith(a) : sl.endsWith(a);
  };
  if (v.k === "str") return check(v.v);
  if (v.k === "list") return v.v.some(check);
  return false;
}

function inListEval(v: FVal, list: string[]): boolean {
  if (list.length === 0) return false;
  const lows = list.map((s) => s.toLowerCase());
  const hit = (s: string) => lows.includes(s.toLowerCase());
  if (v.k === "str") return hit(v.v);
  if (v.k === "list") return v.v.some(hit);
  if (v.k === "num") return hit(formatNum(v.v));
  if (v.k === "bool") return hit(String(v.v));
  return false;
}

export function matches(p: Predicate, n: QqlNote): boolean {
  switch (p.kind) {
    case "all":
      return true;
    case "hasTag":
      return n.tags.some((x) => x === p.tag);
    case "hasField":
      return fieldValue(p.field, n).k !== "missing";
    case "cmp":
      return cmpEval(fieldValue(p.field, n), p.op, p.lit);
    case "contains":
      return containsEval(fieldValue(p.field, n), p.needle);
    case "startsWith":
      return prefixEval(fieldValue(p.field, n), p.prefix, true);
    case "endsWith":
      return prefixEval(fieldValue(p.field, n), p.suffix, false);
    case "inList":
      return inListEval(fieldValue(p.field, n), p.list);
    case "not":
      return !matches(p.inner, n);
    case "and":
      return p.preds.every((x) => matches(x, n));
    case "or":
      return p.preds.some((x) => matches(x, n));
  }
}

function cmpField(a: FVal, b: FVal): number {
  if (a.k === "missing" && b.k === "missing") return 0;
  if (a.k === "missing") return 1;
  if (b.k === "missing") return -1;
  if (a.k === "num" && b.k === "num") return a.v - b.v;
  if (a.k === "str" && b.k === "str") return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  if (a.k === "bool" && b.k === "bool") return a.v === b.v ? 0 : a.v ? 1 : -1;
  return 0;
}

function keyString(rf: FieldRef, n: QqlNote): string {
  const v = fieldValue(rf, n);
  switch (v.k) {
    case "missing":
      return "(none)";
    case "str":
      return v.v;
    case "num":
      return formatNum(v.v);
    case "bool":
      return String(v.v);
    case "list":
      return v.v.join(", ");
  }
}

/** 在笔记集上求值。 */
export function evalQql(notes: readonly QqlNote[], q: Query): QqlResultSet {
  let matched = notes.filter((n) => matches(q.filter, n));

  // 多键稳定排序:从最低优先级键开始。
  for (let i = q.order.length - 1; i >= 0; i--) {
    const { field, dir } = q.order[i];
    matched = [...matched].sort((a, b) => {
      const va = fieldValue(field, a);
      const vb = fieldValue(field, b);
      const aMiss = va.k === "missing";
      const bMiss = vb.k === "missing";
      if (aMiss && bMiss) return 0;
      if (aMiss) return 1;
      if (bMiss) return -1;
      const o = cmpField(va, vb);
      return dir === "asc" ? o : -o;
    });
  }

  if (q.limit != null) matched = matched.slice(0, q.limit);
  const ids = matched.map((n) => n.id);

  switch (q.render.kind) {
    case "list":
      return { List: ids };
    case "count":
      return { Count: matched.length };
    case "table": {
      const cols =
        q.select.kind === "fields" ? q.select.cols : [];
      return {
        Table: matched.map((n) => ({
          id: n.id,
          fields:
            cols.length === 0
              ? null
              : cols.map((c) => projectStr(c.field, n)),
        })),
      };
    }
    case "sum": {
      let total = 0;
      for (const n of matched) {
        const v = fieldValue(q.render.field, n);
        if (v.k === "num") total += v.v;
      }
      return { Sum: total };
    }
    case "groupBy":
    case "histogram": {
      const rf = q.render.field;
      const map = new Map<string, number[]>();
      for (const n of matched) {
        const key = keyString(rf, n);
        let arr = map.get(key);
        if (!arr) {
          arr = [];
          map.set(key, arr);
        }
        arr.push(n.id);
      }
      const rows = [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, idList]) => ({
          key,
          count: idList.length,
          ids: idList,
        }));
      return q.render.kind === "histogram"
        ? { Histogram: rows }
        : { Groups: rows };
    }
  }
}
