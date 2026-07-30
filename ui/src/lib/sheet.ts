/**
 * sheet —— F-SHEET v1 嵌入式表格(纯逻辑)。
 *
 * 独立 `.sheet` 文件 = JSON schema;网格 + 基础公式。
 * 公式子集:`=A1`、`=A1+B2`、`=A1-B1`、`=A1*B1`、`=A1/B1`、字面量数字。
 * 不依赖 ironcalc(v1 自研轻量引擎,可换)。
 */

export const SHEET_SCHEMA_VERSION = 1 as const;

export interface OpenObsidianSheet {
  openobsidianSheet: typeof SHEET_SCHEMA_VERSION;
  /** 单元格:键为 A1 风格,值为原始输入(含公式字符串)。 */
  cells: Record<string, string>;
  rows?: number;
  cols?: number;
}

export const DEFAULT_SHEET_ROWS = 20;
export const DEFAULT_SHEET_COLS = 10;

export function isSheetPath(path: string): boolean {
  return path.toLowerCase().endsWith(".sheet");
}

export function emptySheetContent(): string {
  return JSON.stringify(createEmptySheet(), null, 2);
}

export function createEmptySheet(
  rows = DEFAULT_SHEET_ROWS,
  cols = DEFAULT_SHEET_COLS,
): OpenObsidianSheet {
  return {
    openobsidianSheet: SHEET_SCHEMA_VERSION,
    cells: {},
    rows,
    cols,
  };
}

export function parseSheet(raw: string): OpenObsidianSheet {
  if (!raw || !raw.trim()) return createEmptySheet();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return createEmptySheet();
  }
  if (typeof data !== "object" || data === null) return createEmptySheet();
  const o = data as Record<string, unknown>;
  const cells: Record<string, string> = {};
  if (typeof o.cells === "object" && o.cells !== null) {
    for (const [k, v] of Object.entries(o.cells as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") {
        cells[normalizeCellRef(k)] = String(v);
      }
    }
  }
  return {
    openobsidianSheet: SHEET_SCHEMA_VERSION,
    cells,
    rows:
      typeof o.rows === "number" && o.rows > 0
        ? Math.min(200, Math.floor(o.rows))
        : DEFAULT_SHEET_ROWS,
    cols:
      typeof o.cols === "number" && o.cols > 0
        ? Math.min(52, Math.floor(o.cols))
        : DEFAULT_SHEET_COLS,
  };
}

export function serializeSheet(doc: OpenObsidianSheet): string {
  return JSON.stringify(
    {
      openobsidianSheet: SHEET_SCHEMA_VERSION,
      cells: doc.cells,
      rows: doc.rows ?? DEFAULT_SHEET_ROWS,
      cols: doc.cols ?? DEFAULT_SHEET_COLS,
    },
    null,
    2,
  );
}

/** 列索引 0 → A, 25 → Z, 26 → AA。 */
export function colToLetters(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function lettersToCol(letters: string): number {
  const u = letters.toUpperCase();
  let n = 0;
  for (let i = 0; i < u.length; i++) {
    n = n * 26 + (u.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function cellRef(col: number, row: number): string {
  return `${colToLetters(col)}${row + 1}`;
}

export function normalizeCellRef(ref: string): string {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return ref.trim().toUpperCase();
  return `${m[1].toUpperCase()}${Number(m[2])}`;
}

export function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { col: lettersToCol(m[1]), row: Number(m[2]) - 1 };
}

type NumOrErr = number | { err: "#ERR" | "#CYCLE" | "#DIV0" };

/**
 * 求值单元格显示值。公式以 `=` 开头;检测环依赖。
 * @returns 显示字符串(错误以 #ERR / #CYCLE / #DIV0 表示)。
 */
export function evalCell(
  ref: string,
  cells: Record<string, string>,
  stack: Set<string> = new Set(),
): string {
  const key = normalizeCellRef(ref);
  const raw = cells[key];
  if (raw == null || raw === "") return "";
  if (!raw.startsWith("=")) return raw;
  if (stack.has(key)) return "#CYCLE";
  stack.add(key);
  try {
    const expr = raw.slice(1).trim();
    const n = evalExpr(expr, cells, stack);
    if (typeof n === "object") return n.err;
    if (!Number.isFinite(n)) return "#DIV0";
    if (Math.floor(n) === n) return String(n);
    return String(Math.round(n * 1e6) / 1e6);
  } finally {
    stack.delete(key);
  }
}

/** 支持:数字、A1 引用、+ - * / 与括号(简单递归下降)。 */
function evalExpr(
  expr: string,
  cells: Record<string, string>,
  stack: Set<string>,
): NumOrErr {
  const tokens = tokenizeExpr(expr);
  if (!tokens) return { err: "#ERR" };
  let i = 0;

  function peek() {
    return tokens![i];
  }
  function bump() {
    return tokens![i++];
  }

  function parsePrimary(): NumOrErr {
    const t = peek();
    if (!t) return { err: "#ERR" };
    if (t.kind === "num") {
      bump();
      return t.v;
    }
    if (t.kind === "ref") {
      bump();
      const s = evalCell(t.v, cells, stack);
      if (s === "#CYCLE") return { err: "#CYCLE" };
      if (s === "#DIV0") return { err: "#DIV0" };
      if (s === "" || s.startsWith("#")) return { err: "#ERR" };
      const n = Number(s);
      return Number.isFinite(n) ? n : { err: "#ERR" };
    }
    if (t.kind === "lparen") {
      bump();
      const v = parseAdd();
      if (peek()?.kind !== "rparen") return { err: "#ERR" };
      bump();
      return v;
    }
    if (t.kind === "op" && t.v === "-") {
      bump();
      const v = parsePrimary();
      if (typeof v === "object") return v;
      return -v;
    }
    return { err: "#ERR" };
  }

  function parseMul(): NumOrErr {
    let left = parsePrimary();
    if (typeof left === "object") return left;
    while (true) {
      const t = peek();
      if (!t || t.kind !== "op" || (t.v !== "*" && t.v !== "/")) break;
      const op = t.v;
      bump();
      const right = parsePrimary();
      if (typeof right === "object") return right;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseAdd(): NumOrErr {
    let left = parseMul();
    if (typeof left === "object") return left;
    while (true) {
      const t = peek();
      if (!t || t.kind !== "op" || (t.v !== "+" && t.v !== "-")) break;
      const op = t.v;
      bump();
      const right = parseMul();
      if (typeof right === "object") return right;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  const v = parseAdd();
  if (i !== tokens.length) return { err: "#ERR" };
  return v;
}

type ETok =
  | { kind: "num"; v: number }
  | { kind: "ref"; v: string }
  | { kind: "op"; v: string }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenizeExpr(expr: string): ETok[] | null {
  const out: ETok[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      const n = Number(s.slice(i, j));
      if (!Number.isFinite(n)) return null;
      out.push({ kind: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j += 1;
      const letters = s.slice(i, j);
      let k = j;
      while (k < s.length && /[0-9]/.test(s[k])) k += 1;
      if (k === j) return null;
      out.push({ kind: "ref", v: normalizeCellRef(letters + s.slice(j, k)) });
      i = k;
      continue;
    }
    if ("+-*/".includes(c)) {
      out.push({ kind: "op", v: c });
      i += 1;
      continue;
    }
    if (c === "(") {
      out.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (c === ")") {
      out.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    return null;
  }
  return out;
}

/** 设置单元格并返回新 doc。 */
export function setCell(
  doc: OpenObsidianSheet,
  ref: string,
  value: string,
): OpenObsidianSheet {
  const key = normalizeCellRef(ref);
  const cells = { ...doc.cells };
  if (value === "") delete cells[key];
  else cells[key] = value;
  return { ...doc, cells };
}
