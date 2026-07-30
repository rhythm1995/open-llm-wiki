/**
 * QQL 文本解析(layer 1):字符串 → Query AST。
 * 语义对齐 core/src/qql.rs(关键字大小写不敏感;WHERE 可隐式)。
 */
import {
  emptyQuery,
  type Cmp,
  type Column,
  type Direction,
  type FieldRef,
  type Literal,
  type OrderKey,
  type Predicate,
  type Query,
  type Render,
  type Select,
} from "./types";

export class QqlParseError extends Error {
  constructor(message: string) {
    super(`QQL 解析错误:${message}`);
    this.name = "QqlParseError";
  }
}

type Clause = "where" | "sort" | "limit" | "show" | "render";

type Tok =
  | { t: "clause"; c: Clause }
  | { t: "comma" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "dot" }
  | { t: "eq" }
  | { t: "bangEq" }
  | { t: "gt" }
  | { t: "ge" }
  | { t: "lt" }
  | { t: "le" }
  | { t: "tilde" }
  | { t: "contains" }
  | { t: "startsWith" }
  | { t: "endsWith" }
  | { t: "in" }
  | { t: "and" }
  | { t: "or" }
  | { t: "not" }
  | { t: "has" }
  | { t: "as" }
  | { t: "asc" }
  | { t: "desc" }
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "ident"; v: string }
  | { t: "tag"; v: string };

function lex(input: string): Tok[] {
  const chars = [...input];
  let i = 0;
  const out: Tok[] = [];
  while (i < chars.length) {
    const c = chars[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "#") {
      let j = i + 1;
      let t = "";
      while (
        j < chars.length &&
        (/[A-Za-z0-9_\-/]/.test(chars[j]) || chars[j] === "_")
      ) {
        t += chars[j];
        j += 1;
      }
      if (!t) throw new QqlParseError(`空标签 '#'(位置 ${i})`);
      out.push({ t: "tag", v: t });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < chars.length && chars[j] !== '"') {
        if (chars[j] === "\n") throw new QqlParseError(`字符串未闭合(位置 ${i})`);
        s += chars[j];
        j += 1;
      }
      if (j >= chars.length) throw new QqlParseError(`字符串未闭合(位置 ${i})`);
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (c === "!") {
      if (chars[i + 1] === "=") {
        out.push({ t: "bangEq" });
        i += 2;
      } else throw new QqlParseError(`'!' 后应为 '='(位置 ${i})`);
      continue;
    }
    if (c === "=") {
      out.push({ t: "eq" });
      i += 1;
      continue;
    }
    if (c === "~") {
      out.push({ t: "tilde" });
      i += 1;
      continue;
    }
    if (c === ">") {
      if (chars[i + 1] === "=") {
        out.push({ t: "ge" });
        i += 2;
      } else {
        out.push({ t: "gt" });
        i += 1;
      }
      continue;
    }
    if (c === "<") {
      if (chars[i + 1] === "=") {
        out.push({ t: "le" });
        i += 2;
      } else {
        out.push({ t: "lt" });
        i += 1;
      }
      continue;
    }
    if (c === ".") {
      out.push({ t: "dot" });
      i += 1;
      continue;
    }
    if (c === "(") {
      out.push({ t: "lparen" });
      i += 1;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rparen" });
      i += 1;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma" });
      i += 1;
      continue;
    }
    if (
      /[0-9]/.test(c) ||
      (c === "-" && i + 1 < chars.length && /[0-9]/.test(chars[i + 1]))
    ) {
      const neg = c === "-";
      let j = neg ? i + 1 : i;
      while (j < chars.length && /[0-9]/.test(chars[j])) j += 1;
      const numStr = chars.slice(neg ? i + 1 : i, j).join("");
      const num = Number(numStr);
      if (!Number.isFinite(num)) throw new QqlParseError(`数字解析失败:${numStr}`);
      out.push({ t: "num", v: neg ? -num : num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < chars.length && /[A-Za-z0-9_]/.test(chars[j])) j += 1;
      const word = chars.slice(i, j).join("");
      const up = word.toUpperCase();
      const map: Record<string, Tok> = {
        WHERE: { t: "clause", c: "where" },
        SORT: { t: "clause", c: "sort" },
        LIMIT: { t: "clause", c: "limit" },
        SHOW: { t: "clause", c: "show" },
        RENDER: { t: "clause", c: "render" },
        AND: { t: "and" },
        OR: { t: "or" },
        NOT: { t: "not" },
        HAS: { t: "has" },
        AS: { t: "as" },
        ASC: { t: "asc" },
        DESC: { t: "desc" },
        CONTAINS: { t: "contains" },
        STARTSWITH: { t: "startsWith" },
        ENDSWITH: { t: "endsWith" },
        IN: { t: "in" },
        TRUE: { t: "bool", v: true },
        FALSE: { t: "bool", v: false },
      };
      out.push(map[up] ?? { t: "ident", v: word });
      i = j;
      continue;
    }
    throw new QqlParseError(`无法识别的字符 '${c}'(位置 ${i})`);
  }
  return out;
}

class Cursor {
  constructor(
    public toks: Tok[],
    public pos = 0,
  ) {}
  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  bump(): Tok | undefined {
    const t = this.toks[this.pos];
    if (t) this.pos += 1;
    return t;
  }
}

function expectEnd(c: Cursor, name: string): void {
  if (c.pos !== c.toks.length) {
    throw new QqlParseError(`${name} 有多余 token`);
  }
}

function parseFieldRef(c: Cursor): FieldRef {
  const tok = c.bump();
  if (!tok || tok.t !== "ident") throw new QqlParseError("期望字段名");
  const name = tok.v;
  if (c.peek()?.t === "dot") {
    c.bump();
    const m = c.bump();
    if (!m || m.t !== "ident" || m.v.toLowerCase() !== "len") {
      throw new QqlParseError("仅支持 .len()");
    }
    if (c.peek()?.t === "lparen") {
      c.bump();
      if (c.bump()?.t !== "rparen") throw new QqlParseError("期望 )");
    }
    const low = name.toLowerCase();
    if (low === "tags") return { kind: "len", src: { kind: "tags" } };
    if (low === "mentioned_in") return { kind: "len", src: { kind: "backlinks" } };
    if (low === "links") return { kind: "len", src: { kind: "links" } };
    return { kind: "len", src: { kind: "keyList", key: name } };
  }
  const low = name.toLowerCase();
  if (low === "title") return { kind: "title" };
  if (low === "body") return { kind: "body" };
  if (low === "path") return { kind: "path" };
  if (low === "type") return { kind: "type" };
  return { kind: "key", key: name };
}

function parseLiteral(c: Cursor): Literal {
  const t = c.bump();
  if (!t) throw new QqlParseError("期望字面量");
  if (t.t === "str") return { kind: "str", value: t.v };
  if (t.t === "num") return { kind: "int", value: t.v };
  if (t.t === "bool") return { kind: "bool", value: t.v };
  throw new QqlParseError("应为字面量(字符串/数字/bool)");
}

function expectStr(c: Cursor, ctx: string): string {
  const t = c.bump();
  if (!t || t.t !== "str") throw new QqlParseError(`${ctx} 后须为字符串`);
  return t.v;
}

function parseStrList(c: Cursor): string[] {
  if (c.peek()?.t === "lparen") {
    c.bump();
    const out: string[] = [];
    if (c.peek()?.t === "rparen") {
      c.bump();
      return out;
    }
    for (;;) {
      out.push(expectStr(c, "IN"));
      const n = c.peek();
      if (n?.t === "comma") {
        c.bump();
        continue;
      }
      if (n?.t === "rparen") {
        c.bump();
        break;
      }
      throw new QqlParseError("IN 列表中期望 ',' 或 ')'");
    }
    return out;
  }
  return [expectStr(c, "IN")];
}

function tokToCmp(t: Tok): Cmp {
  switch (t.t) {
    case "eq":
      return "eq";
    case "bangEq":
      return "ne";
    case "gt":
      return "gt";
    case "ge":
      return "ge";
    case "lt":
      return "lt";
    case "le":
      return "le";
    default:
      throw new QqlParseError("非比较运算符");
  }
}

function parseOr(c: Cursor): Predicate {
  const terms = [parseAnd(c)];
  while (c.peek()?.t === "or") {
    c.bump();
    terms.push(parseAnd(c));
  }
  return terms.length === 1 ? terms[0] : { kind: "or", preds: terms };
}

function parseAnd(c: Cursor): Predicate {
  const terms = [parseNot(c)];
  while (c.peek()?.t === "and") {
    c.bump();
    terms.push(parseNot(c));
  }
  return terms.length === 1 ? terms[0] : { kind: "and", preds: terms };
}

function parseNot(c: Cursor): Predicate {
  if (c.peek()?.t === "not") {
    c.bump();
    return { kind: "not", inner: parseNot(c) };
  }
  return parseAtom(c);
}

function parseAtom(c: Cursor): Predicate {
  const tok = c.peek();
  if (!tok) throw new QqlParseError("谓词不完整(意外结束)");
  if (tok.t === "lparen") {
    c.bump();
    const p = parseOr(c);
    if (c.bump()?.t !== "rparen") throw new QqlParseError("期望 )");
    return p;
  }
  if (tok.t === "tag") {
    c.bump();
    return { kind: "hasTag", tag: tok.v };
  }
  if (tok.t === "has") {
    c.bump();
    return { kind: "hasField", field: parseFieldRef(c) };
  }
  const rf = parseFieldRef(c);
  const op = c.peek();
  if (!op) throw new QqlParseError("字段后缺少运算符");
  if (
    op.t === "eq" ||
    op.t === "bangEq" ||
    op.t === "gt" ||
    op.t === "ge" ||
    op.t === "lt" ||
    op.t === "le"
  ) {
    c.bump();
    return { kind: "cmp", field: rf, op: tokToCmp(op), lit: parseLiteral(c) };
  }
  if (op.t === "tilde" || op.t === "contains") {
    c.bump();
    return { kind: "contains", field: rf, needle: expectStr(c, "CONTAINS") };
  }
  if (op.t === "startsWith") {
    c.bump();
    return { kind: "startsWith", field: rf, prefix: expectStr(c, "STARTSWITH") };
  }
  if (op.t === "endsWith") {
    c.bump();
    return { kind: "endsWith", field: rf, suffix: expectStr(c, "ENDSWITH") };
  }
  if (op.t === "in") {
    c.bump();
    return { kind: "inList", field: rf, list: parseStrList(c) };
  }
  throw new QqlParseError("字段后应为比较/CONTAINS/STARTSWITH/ENDSWITH/IN");
}

function splitOnComma(body: Tok[]): Tok[][] {
  const segs: Tok[][] = [[]];
  for (const t of body) {
    if (t.t === "comma") segs.push([]);
    else segs[segs.length - 1].push(t);
  }
  return segs;
}

function parseSort(body: Tok[]): OrderKey[] {
  const keys: OrderKey[] = [];
  for (const seg of splitOnComma(body)) {
    if (seg.length === 0) throw new QqlParseError("SORT:空排序键");
    const c = new Cursor(seg);
    const field = parseFieldRef(c);
    let dir: Direction = "asc";
    const d = c.bump();
    if (d) {
      if (d.t === "asc") dir = "asc";
      else if (d.t === "desc") dir = "desc";
      else throw new QqlParseError("SORT 方向应为 ASC/DESC");
    }
    expectEnd(c, "SORT 键");
    keys.push({ field, dir });
  }
  return keys;
}

function parseLimit(body: Tok[]): number | null {
  if (body.length === 1 && body[0].t === "num" && body[0].v >= 0) {
    return body[0].v;
  }
  throw new QqlParseError("LIMIT 后应为一个非负整数");
}

function parseShow(body: Tok[]): Select {
  const cols: Column[] = [];
  for (const seg of splitOnComma(body)) {
    if (seg.length === 0) throw new QqlParseError("SHOW:空列");
    const c = new Cursor(seg);
    const field = parseFieldRef(c);
    let alias: string | null = null;
    if (c.peek()?.t === "as") {
      c.bump();
      const a = c.bump();
      if (!a || a.t !== "ident") throw new QqlParseError("AS 后应为别名");
      alias = a.v;
    }
    expectEnd(c, "SHOW 列");
    cols.push({ field, alias });
  }
  return { kind: "fields", cols };
}

function parseRenderField(c: Cursor): FieldRef {
  if (c.peek()?.t === "lparen") {
    c.bump();
    const rf = parseFieldRef(c);
    if (c.bump()?.t !== "rparen") throw new QqlParseError("期望 )");
    return rf;
  }
  return parseFieldRef(c);
}

function parseRender(body: Tok[]): Render {
  const c = new Cursor(body);
  const modeTok = c.bump();
  if (!modeTok || modeTok.t !== "ident") throw new QqlParseError("RENDER 后应为模式名");
  const mode = modeTok.v.toLowerCase();
  let render: Render;
  switch (mode) {
    case "list":
      render = { kind: "list" };
      break;
    case "table":
      render = { kind: "table" };
      break;
    case "count":
      render = { kind: "count" };
      break;
    case "group_by":
    case "groupby":
      render = { kind: "groupBy", field: parseRenderField(c) };
      break;
    case "sum":
      render = { kind: "sum", field: parseRenderField(c) };
      break;
    case "histogram":
      render = { kind: "histogram", field: parseRenderField(c) };
      break;
    default:
      throw new QqlParseError(`未知 RENDER 模式:${mode}`);
  }
  expectEnd(c, "RENDER");
  return render;
}

interface ClauseBodies {
  where?: Tok[];
  sort?: Tok[];
  limit?: Tok[];
  show?: Tok[];
  render?: Tok[];
}

function splitClauses(toks: Tok[]): ClauseBodies {
  const b: ClauseBodies = {};
  let i = 0;
  while (i < toks.length) {
    const head = toks[i];
    if (head.t !== "clause") throw new QqlParseError("子句外的 token");
    i += 1;
    const start = i;
    while (i < toks.length && toks[i].t !== "clause") i += 1;
    const body = toks.slice(start, i);
    const name = head.c;
    if (b[name]) throw new QqlParseError(`重复的子句:${name.toUpperCase()}`);
    b[name] = body;
  }
  return b;
}

/** 解析 QQL 文本为 Query。空串 → 全量列表。 */
export function parseQql(input: string): Query {
  let toks = lex(input);
  if (toks.length === 0) return emptyQuery();
  if (toks[0].t !== "clause") {
    toks = [{ t: "clause", c: "where" }, ...toks];
  }
  const bodies = splitClauses(toks);
  const q = emptyQuery();
  let renderSet = false;
  if (bodies.where) {
    const c = new Cursor(bodies.where);
    q.filter = parseOr(c);
    expectEnd(c, "WHERE");
  }
  if (bodies.sort) q.order = parseSort(bodies.sort);
  if (bodies.limit) q.limit = parseLimit(bodies.limit);
  if (bodies.render) {
    q.render = parseRender(bodies.render);
    renderSet = true;
  }
  if (bodies.show) q.select = parseShow(bodies.show);
  if (!renderSet) {
    q.render =
      q.select.kind === "fields" ? { kind: "table" } : { kind: "list" };
  }
  return q;
}
