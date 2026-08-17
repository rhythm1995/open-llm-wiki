/**
 * sheet —— F-SHEET v2 嵌入式表格(纯逻辑)。
 *
 * - 多工作表 tabs、冻结行列、图表定义(bar/line)
 * - 公式:四则运算 + 引用 + SUM/AVERAGE/MIN/MAX/COUNT(范围) + Sheet!A1 跨表
 * - ironcalc 为可选增强引擎(见 sheet-ironcalc.ts);本文件 IO-free 可单测
 * - v1 单表 JSON 自动迁移
 */

export const SHEET_SCHEMA_VERSION = 2 as const;

export type ChartType = "bar" | "line";

export interface SheetChart {
  id: string;
  type: ChartType;
  title: string;
  /** 数据表 id */
  sheetId: string;
  /** 如 A1:B5(首列类别或数值,其余系列) */
  range: string;
}

export interface SheetTab {
  id: string;
  name: string;
  cells: Record<string, string>;
  rows: number;
  cols: number;
  /** 冻结前 N 行(0=不冻) */
  freezeRows: number;
  /** 冻结前 N 列(0=不冻) */
  freezeCols: number;
}

export interface OpenLlmWikiSheet {
  openLlmWikiSheet: typeof SHEET_SCHEMA_VERSION;
  sheets: SheetTab[];
  activeSheetId: string;
  charts: SheetChart[];
}

export const DEFAULT_SHEET_ROWS = 20;
export const DEFAULT_SHEET_COLS = 10;

export function isSheetPath(path: string): boolean {
  return path.toLowerCase().endsWith(".sheet");
}

export function newSheetId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyTab(
  name = "Sheet1",
  rows = DEFAULT_SHEET_ROWS,
  cols = DEFAULT_SHEET_COLS,
): SheetTab {
  return {
    id: newSheetId(),
    name,
    cells: {},
    rows,
    cols,
    freezeRows: 0,
    freezeCols: 0,
  };
}

export function createEmptySheet(
  rows = DEFAULT_SHEET_ROWS,
  cols = DEFAULT_SHEET_COLS,
): OpenLlmWikiSheet {
  const tab = createEmptyTab("Sheet1", rows, cols);
  return {
    openLlmWikiSheet: SHEET_SCHEMA_VERSION,
    sheets: [tab],
    activeSheetId: tab.id,
    charts: [],
  };
}

export function emptySheetContent(): string {
  return JSON.stringify(createEmptySheet(), null, 2);
}

function parseCells(raw: unknown): Record<string, string> {
  const cells: Record<string, string> = {};
  if (typeof raw !== "object" || raw === null) return cells;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") {
      cells[normalizeCellRef(k)] = String(v);
    }
  }
  return cells;
}

function clampDim(n: unknown, def: number, max: number): number {
  if (typeof n === "number" && n > 0) return Math.min(max, Math.floor(n));
  return def;
}

function parseTab(raw: unknown, fallbackName: string): SheetTab | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const name =
    typeof o.name === "string" && o.name.trim() ? o.name.trim() : fallbackName;
  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim() : newSheetId();
  return {
    id,
    name,
    cells: parseCells(o.cells),
    rows: clampDim(o.rows, DEFAULT_SHEET_ROWS, 200),
    cols: clampDim(o.cols, DEFAULT_SHEET_COLS, 52),
    freezeRows: clampDim(o.freezeRows, 0, 20),
    freezeCols: clampDim(o.freezeCols, 0, 10),
  };
}

/** 解析磁盘 JSON;兼容 v1 单表。 */
export function parseSheet(raw: string): OpenLlmWikiSheet {
  if (!raw || !raw.trim()) return createEmptySheet();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return createEmptySheet();
  }
  if (typeof data !== "object" || data === null) return createEmptySheet();
  const o = data as Record<string, unknown>;

  // v2 multi-sheet
  if (Array.isArray(o.sheets) && o.sheets.length > 0) {
    const sheets: SheetTab[] = [];
    o.sheets.forEach((s, i) => {
      const t = parseTab(s, `Sheet${i + 1}`);
      if (t) sheets.push(t);
    });
    if (sheets.length === 0) return createEmptySheet();
    const active =
      typeof o.activeSheetId === "string" &&
      sheets.some((s) => s.id === o.activeSheetId)
        ? o.activeSheetId
        : sheets[0].id;
    const charts: SheetChart[] = [];
    if (Array.isArray(o.charts)) {
      for (const c of o.charts) {
        if (typeof c !== "object" || c === null) continue;
        const ch = c as Record<string, unknown>;
        const id =
          typeof ch.id === "string" ? ch.id : `c_${charts.length + 1}`;
        const type: ChartType = ch.type === "line" ? "line" : "bar";
        const sheetId =
          typeof ch.sheetId === "string" ? ch.sheetId : sheets[0].id;
        const range =
          typeof ch.range === "string" && ch.range.trim()
            ? ch.range.trim().toUpperCase()
            : "A1:B5";
        const title = typeof ch.title === "string" ? ch.title : "";
        charts.push({ id, type, title, sheetId, range });
      }
    }
    return {
      openLlmWikiSheet: SHEET_SCHEMA_VERSION,
      sheets,
      activeSheetId: active,
      charts,
    };
  }

  // v1: top-level cells
  const tab = createEmptyTab("Sheet1");
  tab.cells = parseCells(o.cells);
  tab.rows = clampDim(o.rows, DEFAULT_SHEET_ROWS, 200);
  tab.cols = clampDim(o.cols, DEFAULT_SHEET_COLS, 52);
  return {
    openLlmWikiSheet: SHEET_SCHEMA_VERSION,
    sheets: [tab],
    activeSheetId: tab.id,
    charts: [],
  };
}

export function serializeSheet(doc: OpenLlmWikiSheet): string {
  return JSON.stringify(
    {
      openLlmWikiSheet: SHEET_SCHEMA_VERSION,
      activeSheetId: doc.activeSheetId,
      sheets: doc.sheets.map((s) => ({
        id: s.id,
        name: s.name,
        cells: s.cells,
        rows: s.rows,
        cols: s.cols,
        freezeRows: s.freezeRows,
        freezeCols: s.freezeCols,
      })),
      charts: doc.charts,
    },
    null,
    2,
  );
}

export function activeTab(doc: OpenLlmWikiSheet): SheetTab {
  return (
    doc.sheets.find((s) => s.id === doc.activeSheetId) ?? doc.sheets[0]
  );
}

export function setActiveSheet(
  doc: OpenLlmWikiSheet,
  sheetId: string,
): OpenLlmWikiSheet {
  if (!doc.sheets.some((s) => s.id === sheetId)) return doc;
  return { ...doc, activeSheetId: sheetId };
}

export function addSheet(
  doc: OpenLlmWikiSheet,
  name?: string,
): OpenLlmWikiSheet {
  const n = name?.trim() || `Sheet${doc.sheets.length + 1}`;
  const tab = createEmptyTab(n);
  return {
    ...doc,
    sheets: [...doc.sheets, tab],
    activeSheetId: tab.id,
  };
}

export function renameSheet(
  doc: OpenLlmWikiSheet,
  sheetId: string,
  name: string,
): OpenLlmWikiSheet {
  const n = name.trim();
  if (!n) return doc;
  return {
    ...doc,
    sheets: doc.sheets.map((s) => (s.id === sheetId ? { ...s, name: n } : s)),
  };
}

export function removeSheet(
  doc: OpenLlmWikiSheet,
  sheetId: string,
): OpenLlmWikiSheet {
  if (doc.sheets.length <= 1) return doc;
  const sheets = doc.sheets.filter((s) => s.id !== sheetId);
  const activeSheetId =
    doc.activeSheetId === sheetId ? sheets[0].id : doc.activeSheetId;
  return {
    ...doc,
    sheets,
    activeSheetId,
    charts: doc.charts.filter((c) => c.sheetId !== sheetId),
  };
}

export function setFreeze(
  doc: OpenLlmWikiSheet,
  sheetId: string,
  freezeRows: number,
  freezeCols: number,
): OpenLlmWikiSheet {
  return {
    ...doc,
    sheets: doc.sheets.map((s) =>
      s.id === sheetId
        ? {
            ...s,
            freezeRows: Math.max(0, Math.min(20, freezeRows)),
            freezeCols: Math.max(0, Math.min(10, freezeCols)),
          }
        : s,
    ),
  };
}

export function setCell(
  doc: OpenLlmWikiSheet,
  ref: string,
  value: string,
  sheetId?: string,
): OpenLlmWikiSheet {
  const id = sheetId ?? doc.activeSheetId;
  const key = normalizeCellRef(ref);
  return {
    ...doc,
    sheets: doc.sheets.map((s) => {
      if (s.id !== id) return s;
      const cells = { ...s.cells };
      if (value === "") delete cells[key];
      else cells[key] = value;
      return { ...s, cells };
    }),
  };
}

export function upsertChart(
  doc: OpenLlmWikiSheet,
  chart: SheetChart,
): OpenLlmWikiSheet {
  const rest = doc.charts.filter((c) => c.id !== chart.id);
  return { ...doc, charts: [...rest, chart] };
}

export function removeChart(
  doc: OpenLlmWikiSheet,
  chartId: string,
): OpenLlmWikiSheet {
  return { ...doc, charts: doc.charts.filter((c) => c.id !== chartId) };
}

// ── cell refs ──

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

/** A1:B3 → 矩形内所有 ref。 */
export function expandRange(range: string): string[] {
  const cleaned = range.trim().toUpperCase().replace(/^[^!]*!/, "");
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(cleaned);
  if (!m) {
    const one = normalizeCellRef(cleaned);
    return parseCellRef(one) ? [one] : [];
  }
  const c1 = lettersToCol(m[1]);
  const r1 = Number(m[2]) - 1;
  const c2 = lettersToCol(m[3]);
  const r2 = Number(m[4]) - 1;
  const out: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      out.push(cellRef(c, r));
    }
  }
  return out;
}

export function parseSheetQualifiedRef(
  token: string,
): { sheetName: string | null; ref: string } {
  const t = token.trim();
  const bang = t.lastIndexOf("!");
  if (bang < 0) return { sheetName: null, ref: normalizeCellRef(t) };
  let sheetName = t.slice(0, bang).replace(/^'|'$/g, "");
  const ref = normalizeCellRef(t.slice(bang + 1));
  return { sheetName, ref };
}

// ── evaluation ──

type NumOrErr = number | { err: "#ERR" | "#CYCLE" | "#DIV0" | "#NAME" };

function tabByName(doc: OpenLlmWikiSheet, name: string | null): SheetTab {
  if (!name) return activeTab(doc);
  const found = doc.sheets.find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
  return found ?? activeTab(doc);
}

function cellsOf(doc: OpenLlmWikiSheet, sheetName: string | null): Record<string, string> {
  return tabByName(doc, sheetName).cells;
}

/**
 * 求值单元格。`doc` 提供跨表上下文;缺省时仅当前 active 表 cells。
 */
export function evalCell(
  ref: string,
  cellsOrDoc: Record<string, string> | OpenLlmWikiSheet,
  stack: Set<string> = new Set(),
  sheetName: string | null = null,
): string {
  const doc: OpenLlmWikiSheet | null =
    cellsOrDoc &&
    typeof cellsOrDoc === "object" &&
    "sheets" in cellsOrDoc &&
    Array.isArray((cellsOrDoc as OpenLlmWikiSheet).sheets)
      ? (cellsOrDoc as OpenLlmWikiSheet)
      : null;
  const cells = doc
    ? cellsOf(doc, sheetName)
    : (cellsOrDoc as Record<string, string>);
  const key = normalizeCellRef(ref);
  const stackKey = `${sheetName ?? ""}!${key}`;
  const raw = cells[key];
  if (raw == null || raw === "") return "";
  if (!raw.startsWith("=")) return raw;
  if (stack.has(stackKey)) return "#CYCLE";
  stack.add(stackKey);
  try {
    const expr = raw.slice(1).trim();
    const n = evalExpr(expr, cells, stack, doc, sheetName);
    if (typeof n === "object") return n.err;
    if (!Number.isFinite(n)) return "#DIV0";
    if (Math.floor(n) === n) return String(n);
    return String(Math.round(n * 1e6) / 1e6);
  } finally {
    stack.delete(stackKey);
  }
}

/** 工作簿上批量显示值(active 表)。 */
export function evalAllDisplay(
  doc: OpenLlmWikiSheet,
  sheetId?: string,
): Map<string, string> {
  const tab =
    doc.sheets.find((s) => s.id === (sheetId ?? doc.activeSheetId)) ??
    activeTab(doc);
  const m = new Map<string, string>();
  for (let r = 0; r < tab.rows; r++) {
    for (let c = 0; c < tab.cols; c++) {
      const ref = cellRef(c, r);
      m.set(ref, evalCell(ref, doc, new Set(), tab.name));
    }
  }
  return m;
}

function evalExpr(
  expr: string,
  cells: Record<string, string>,
  stack: Set<string>,
  doc: OpenLlmWikiSheet | null,
  sheetName: string | null,
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
    if (t.kind === "fn") {
      bump();
      if (peek()?.kind !== "lparen") return { err: "#ERR" };
      bump();
      // args: range or expr list
      const args: string[] = [];
      if (peek()?.kind === "rparen") {
        bump();
      } else {
        // collect raw until matching paren at top level — simplified: one range or comma nums
        let depth = 1;
        let buf = "";
        while (i < tokens!.length && depth > 0) {
          const cur = tokens![i];
          if (cur.kind === "lparen") {
            depth++;
            buf += "(";
            i++;
            continue;
          }
          if (cur.kind === "rparen") {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
            buf += ")";
            i++;
            continue;
          }
          if (cur.kind === "comma" && depth === 1) {
            args.push(buf.trim());
            buf = "";
            i++;
            continue;
          }
          if (cur.kind === "num") buf += String(cur.v);
          else if (cur.kind === "ref") buf += cur.v;
          else if (cur.kind === "op") buf += cur.v;
          else if (cur.kind === "fn") buf += cur.v;
          i++;
        }
        if (buf.trim()) args.push(buf.trim());
      }
      return evalFunc(t.v, args, cells, stack, doc, sheetName);
    }
    if (t.kind === "ref") {
      bump();
      const { sheetName: sn, ref } = parseSheetQualifiedRef(t.v);
      const s = doc
        ? evalCell(ref, doc, stack, sn)
        : evalCell(ref, cells, stack, null);
      if (s === "#CYCLE") return { err: "#CYCLE" };
      if (s === "#DIV0") return { err: "#DIV0" };
      if (s === "#NAME") return { err: "#NAME" };
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

function evalFunc(
  name: string,
  args: string[],
  cells: Record<string, string>,
  stack: Set<string>,
  doc: OpenLlmWikiSheet | null,
  sheetName: string | null,
): NumOrErr {
  const fn = name.toUpperCase();
  const nums: number[] = [];
  for (const a of args) {
    // range like A1:B2 or Sheet1!A1:A3
    const rangePart = a.includes(":") ? a : null;
    if (rangePart) {
      let sn = sheetName;
      let range = rangePart;
      const bang = rangePart.lastIndexOf("!");
      if (bang >= 0) {
        sn = rangePart.slice(0, bang).replace(/^'|'$/g, "");
        range = rangePart.slice(bang + 1);
      }
      for (const ref of expandRange(range)) {
        const s = doc
          ? evalCell(ref, doc, stack, sn)
          : evalCell(ref, cells, stack, null);
        const n = Number(s);
        if (Number.isFinite(n)) nums.push(n);
      }
    } else {
      // single ref or number
      const asNum = Number(a);
      if (Number.isFinite(asNum) && !/^[A-Za-z]/.test(a)) {
        nums.push(asNum);
        continue;
      }
      const { sheetName: sn, ref } = parseSheetQualifiedRef(a);
      const s = doc
        ? evalCell(ref, doc, stack, sn)
        : evalCell(ref, cells, stack, null);
      const n = Number(s);
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  switch (fn) {
    case "SUM":
      return nums.reduce((a, b) => a + b, 0);
    case "AVERAGE":
    case "AVG":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : { err: "#DIV0" };
    case "MIN":
      return nums.length ? Math.min(...nums) : { err: "#ERR" };
    case "MAX":
      return nums.length ? Math.max(...nums) : { err: "#ERR" };
    case "COUNT":
      return nums.length;
    default:
      return { err: "#NAME" };
  }
}

type ETok =
  | { kind: "num"; v: number }
  | { kind: "ref"; v: string }
  | { kind: "fn"; v: string }
  | { kind: "op"; v: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

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
    if (/[A-Za-z_]/.test(c) || c === "'") {
      // function name or Sheet!A1 or A1
      let j = i;
      if (c === "'") {
        j++;
        while (j < s.length && s[j] !== "'") j++;
        if (j >= s.length) return null;
        j++; // closing '
      } else {
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      }
      // Sheet!ref
      if (s[j] === "!") {
        j++;
        while (j < s.length && /[A-Za-z0-9$]/.test(s[j])) j++;
        if (s[j] === ":") {
          j++;
          while (j < s.length && /[A-Za-z0-9$]/.test(s[j])) j++;
        }
        out.push({ kind: "ref", v: s.slice(i, j) });
        i = j;
        continue;
      }
      // function CALL
      if (s[j] === "(") {
        out.push({ kind: "fn", v: s.slice(i, j) });
        i = j;
        continue;
      }
      // A1 or A1:B2
      let k = j;
      while (k < s.length && /[A-Za-z0-9$]/.test(s[k])) k++;
      if (s[k] === ":") {
        k++;
        while (k < s.length && /[A-Za-z0-9$]/.test(s[k])) k++;
        out.push({ kind: "ref", v: s.slice(i, k) });
        i = k;
        continue;
      }
      // plain ref A1
      const piece = s.slice(i, k);
      if (/^[A-Za-z]+\d+$/.test(piece)) {
        out.push({ kind: "ref", v: piece });
        i = k;
        continue;
      }
      // bare ident treated as fn name missing paren → error later
      out.push({ kind: "fn", v: piece });
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
    if (c === ",") {
      out.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (c === "$") {
      i += 1;
      continue;
    }
    return null;
  }
  return out;
}

// ── charts ──

export interface ChartSeries {
  labels: string[];
  series: { name: string; values: number[] }[];
}

/** 从 range 抽图表数据:第一列标签,其余数值列;或单列纯数值。 */
export function chartDataFromRange(
  doc: OpenLlmWikiSheet,
  sheetId: string,
  range: string,
): ChartSeries {
  const tab = doc.sheets.find((s) => s.id === sheetId) ?? activeTab(doc);
  const refs = expandRange(range);
  if (refs.length === 0) return { labels: [], series: [] };
  const parsed = refs.map((r) => parseCellRef(r)!).filter(Boolean);
  const minC = Math.min(...parsed.map((p) => p.col));
  const maxC = Math.max(...parsed.map((p) => p.col));
  const minR = Math.min(...parsed.map((p) => p.row));
  const maxR = Math.max(...parsed.map((p) => p.row));
  const labels: string[] = [];
  const seriesCols: number[] = [];
  for (let c = minC; c <= maxC; c++) seriesCols.push(c);

  // if multiple columns, first is labels when non-numeric
  const useLabels = maxC > minC;
  const valueCols = useLabels ? seriesCols.slice(1) : seriesCols;
  const labelCol = useLabels ? minC : -1;

  for (let r = minR; r <= maxR; r++) {
    if (labelCol >= 0) {
      const lab = evalCell(cellRef(labelCol, r), doc, new Set(), tab.name);
      labels.push(lab || cellRef(0, r));
    } else {
      labels.push(String(r + 1));
    }
  }

  const series = valueCols.map((c) => {
    const name = colToLetters(c);
    const values: number[] = [];
    for (let r = minR; r <= maxR; r++) {
      const s = evalCell(cellRef(c, r), doc, new Set(), tab.name);
      const n = Number(s);
      values.push(Number.isFinite(n) ? n : 0);
    }
    return { name, values };
  });

  return { labels, series };
}

/** 生成简易 SVG bar chart。 */
export function renderChartSvg(
  data: ChartSeries,
  type: ChartType,
  width = 320,
  height = 160,
): string {
  const pad = 28;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const all = data.series.flatMap((s) => s.values);
  const max = Math.max(1, ...all, 0);
  const n = Math.max(1, data.labels.length);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(
    `<rect x="0" y="0" width="${width}" height="${height}" fill="var(--color-base,#fff)" stroke="var(--color-crust,#ddd)"/>`,
  );
  if (type === "bar") {
    const groupW = w / n;
    const barW = Math.max(2, (groupW * 0.7) / Math.max(1, data.series.length));
    data.series.forEach((ser, si) => {
      ser.values.forEach((v, i) => {
        const bh = (Math.max(0, v) / max) * h;
        const x = pad + i * groupW + si * barW + groupW * 0.15;
        const y = pad + h - bh;
        const hue = (si * 60) % 360;
        parts.push(
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="hsl(${hue} 55% 50%)"/>`,
        );
      });
    });
  } else {
    data.series.forEach((ser, si) => {
      const hue = (si * 60) % 360;
      const pts = ser.values
        .map((v, i) => {
          const x = pad + (i / Math.max(1, n - 1)) * w;
          const y = pad + h - (Math.max(0, v) / max) * h;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      parts.push(
        `<polyline fill="none" stroke="hsl(${hue} 55% 45%)" stroke-width="2" points="${pts}"/>`,
      );
    });
  }
  // x labels sparse
  data.labels.forEach((lab, i) => {
    if (n > 8 && i % Math.ceil(n / 6) !== 0) return;
    const x = pad + (i + 0.5) * (w / n);
    parts.push(
      `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9" fill="var(--color-overlay,#888)">${escapeXml(lab.slice(0, 8))}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

function escapeXml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c] as string,
  );
}

/** 渲染只读 HTML 表格(阅读嵌入用)。 */
export function sheetToHtmlTable(
  doc: OpenLlmWikiSheet,
  opts?: { sheetId?: string; maxRows?: number; maxCols?: number },
): string {
  const tab =
    doc.sheets.find((s) => s.id === opts?.sheetId) ?? activeTab(doc);
  const rows = Math.min(tab.rows, opts?.maxRows ?? 30);
  const cols = Math.min(tab.cols, opts?.maxCols ?? 12);
  const lines: string[] = [
    `<div class="oo-sheet-embed" data-sheet="${escapeXml(tab.name)}">`,
    `<div class="oo-sheet-embed-title">${escapeXml(tab.name)}</div>`,
    "<table><thead><tr><th></th>",
  ];
  for (let c = 0; c < cols; c++) {
    lines.push(`<th>${colToLetters(c)}</th>`);
  }
  lines.push("</tr></thead><tbody>");
  for (let r = 0; r < rows; r++) {
    lines.push(`<tr><th>${r + 1}</th>`);
    for (let c = 0; c < cols; c++) {
      const ref = cellRef(c, r);
      const val = evalCell(ref, doc, new Set(), tab.name);
      lines.push(`<td>${escapeXml(val)}</td>`);
    }
    lines.push("</tr>");
  }
  lines.push("</tbody></table></div>");
  // charts for this sheet
  for (const ch of doc.charts.filter((c) => c.sheetId === tab.id)) {
    const data = chartDataFromRange(doc, tab.id, ch.range);
    lines.push(
      `<div class="oo-sheet-chart"><div class="oo-sheet-chart-title">${escapeXml(ch.title || ch.type)}</div>${renderChartSvg(data, ch.type)}</div>`,
    );
  }
  return lines.join("");
}
