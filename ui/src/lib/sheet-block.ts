/**
 * sheet-block —— 笔记内 ```sheet 围栏(F-SHEET 嵌入 md)。
 *
 * 语法:
 * ```sheet
 * path: budget.sheet
 * tab: Sheet1
 * ```
 * 或内联格:
 * ```sheet
 * A1=10
 * A2==A1*2
 * ```
 *
 * 纯逻辑:定位块 + 把 body 解析成预览 HTML(需外部提供 vault 读 path 内容)。
 */
import {
  createEmptySheet,
  evalCell,
  parseSheet,
  setCell,
  sheetToHtmlTable,
  type OpenObsidianSheet,
} from "./sheet";

export interface SheetBlock {
  startLine: number;
  endLine: number;
  body: string;
}

export interface SheetBlockSpec {
  /** vault 相对路径到 .sheet */
  path: string | null;
  /** 表名 */
  tab: string | null;
  /** 内联单元格 A1=... */
  inlineCells: Record<string, string>;
}

/** 找所有 ```sheet 围栏(围栏代码块扫描,同形函数沿用此套路)。 */
export function findSheetBlocks(src: string): SheetBlock[] {
  const lines = src.split(/\r?\n/);
  const blocks: SheetBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (open) {
      const indent = open[1];
      const fence = open[2];
      const info = open[3].trim();
      if (/\bsheet\b/i.test(info)) {
        const fenceChar = fence[0];
        const fenceLen = fence.length;
        const startLine = i;
        const body: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const close = lines[j].match(/^( {0,3})(`{3,}|~{3,})\s*$/);
          if (
            close &&
            close[1].length <= indent.length &&
            close[2][0] === fenceChar &&
            close[2].length >= fenceLen
          ) {
            break;
          }
          body.push(lines[j]);
          j++;
        }
        const endLine = j < lines.length ? j : lines.length - 1;
        blocks.push({ startLine, endLine, body: body.join("\n") });
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

/** 解析 sheet 块 body。 */
export function parseSheetBlockBody(body: string): SheetBlockSpec {
  const pathM = /^\s*path\s*:\s*(.+)$/im.exec(body);
  const tabM = /^\s*tab\s*:\s*(.+)$/im.exec(body);
  const inlineCells: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z]+\d+)\s*=\s*(.*)$/.exec(line);
    if (m) inlineCells[m[1].toUpperCase()] = m[2];
  }
  return {
    path: pathM ? pathM[1].trim().replace(/^["']|["']$/g, "") : null,
    tab: tabM ? tabM[1].trim().replace(/^["']|["']$/g, "") : null,
    inlineCells,
  };
}

/**
 * 根据 spec + 可选 vault 文件内容生成 HTML 预览。
 * `fileContent` 为 path 指向的 .sheet 原文;无 path 则用 inline。
 */
export function sheetBlockToHtml(
  spec: SheetBlockSpec,
  fileContent: string | null,
): string {
  let doc: OpenObsidianSheet;
  if (spec.path && fileContent != null) {
    doc = parseSheet(fileContent);
    if (spec.tab) {
      const t = doc.sheets.find(
        (s) => s.name.toLowerCase() === spec.tab!.toLowerCase(),
      );
      if (t) doc = { ...doc, activeSheetId: t.id };
    }
  } else {
    doc = createEmptySheet(12, 6);
    for (const [ref, val] of Object.entries(spec.inlineCells)) {
      doc = setCell(doc, ref, val);
    }
  }
  // 应用 inline 覆盖
  for (const [ref, val] of Object.entries(spec.inlineCells)) {
    doc = setCell(doc, ref, val);
  }
  return sheetToHtmlTable(doc, { maxRows: 15, maxCols: 8 });
}

/** 把 markdown 中 sheet 围栏替换为 HTML 预览(resolve 异步读文件)。 */
export async function rewriteMarkdownSheetBlocks(
  md: string,
  resolveFile: (path: string) => Promise<string | null>,
): Promise<string> {
  const blocks = findSheetBlocks(md);
  if (blocks.length === 0) return md;
  const lines = md.split(/\r?\n/);
  // 从后往前替换,避免行号漂移
  for (let bi = blocks.length - 1; bi >= 0; bi--) {
    const b = blocks[bi];
    const spec = parseSheetBlockBody(b.body);
    let file: string | null = null;
    if (spec.path) {
      try {
        file = await resolveFile(spec.path);
      } catch {
        file = null;
      }
    }
    const html =
      spec.path && file == null
        ? `<div class="oo-sheet-embed oo-sheet-missing">sheet not found: ${escape(spec.path)}</div>`
        : sheetBlockToHtml(spec, file);
    lines.splice(b.startLine, b.endLine - b.startLine + 1, html);
  }
  return lines.join("\n");
}

function escape(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

export { evalCell };
