/**
 * qql-block —— 笔记正文里 ```qql 围栏块的定位与结果渲染(**纯逻辑**,编辑器 widget 与
 * 阅读视图共用,保证两路一致)。
 *
 * - `findQqlBlocks`:行扫描定位所有 ```qql fenced 代码块,取其行区间与查询文本。
 * - `resultToHtml`:把 core 的 ResultSet(List/Table/Count/Groups/Sum)渲染成紧凑 HTML 片段,
 *   所有动态字符串已转义;注入 DOM 前仍建议过 `sanitize()`。
 *
 * 求值:浏览器 mock 走 mock-qql 子集;真机 `run_qql` → Rust core。
 */
import type { ResultSet } from "./ipc";

export interface QqlBlock {
  /** 0-based:开围栏所在行。 */
  startLine: number;
  /** 0-based:闭围栏所在行(未闭合则取文末行)。 */
  endLine: number;
  /** 围栏内的查询文本(已 trim)。 */
  query: string;
}

/**
 * 找出 markdown 源码里所有 ```qql fenced 代码块。
 * info string 含 `qql`(词边界)即认作 qql 块;遵循 CM 的围栏规则——开围栏缩进 ≤3 空格、
 * 闭围栏同字符(``` 或 ~~~)且长度 ≥ 开围栏、缩进 ≤ 开围栏。未闭合取到文末。
 */
export function findQqlBlocks(src: string): QqlBlock[] {
  const lines = src.split(/\r?\n/);
  const blocks: QqlBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (open) {
      const indent = open[1];
      const fence = open[2];
      const info = open[3].trim();
      if (/\bqql\b/i.test(info)) {
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
        blocks.push({ startLine, endLine, query: body.join("\n").trim() });
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

/** HTML 转义(ResultSet 里的标题/字段值都是数据,注入 DOM 前必须转义)。 */
function esc(s: string): string {
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

/**
 * 把 ResultSet 渲染成紧凑 HTML 片段。
 * `idToLabel` 可选:把 List 形态的节点 id 映射成可读标题(无则显示 `#id`)。
 */
export function resultToHtml(
  result: ResultSet,
  idToLabel?: (id: number) => string | null,
): string {
  if ("Count" in result) {
    return `<div class="qql-result qql-count"><span class="qql-num">${result.Count}</span></div>`;
  }
  if ("Sum" in result) {
    const n = result.Sum;
    const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return `<div class="qql-result qql-sum"><span class="qql-num">${s}</span></div>`;
  }
  if ("List" in result) {
    if (result.List.length === 0) return `<div class="qql-result qql-empty">无结果</div>`;
    const items = result.List.map((id) => {
      const label = idToLabel?.(id) ?? `#${id}`;
      return `<li>${esc(label)}</li>`;
    }).join("");
    return `<ul class="qql-result qql-list">${items}</ul>`;
  }
  if ("Groups" in result) {
    if (result.Groups.length === 0) return `<div class="qql-result qql-empty">无分组</div>`;
    const items = result.Groups.map(
      (g) =>
        `<li><span class="qql-key">${esc(g.key || "(空)")}</span><span class="qql-badge">${g.count}</span></li>`,
    ).join("");
    return `<ul class="qql-result qql-groups">${items}</ul>`;
  }
  if ("Histogram" in result) {
    if (result.Histogram.length === 0) return `<div class="qql-result qql-empty">无直方</div>`;
    const max = Math.max(1, ...result.Histogram.map((g) => g.count));
    const items = result.Histogram.map((g) => {
      const pct = Math.round((g.count / max) * 100);
      return `<li><span class="qql-key">${esc(g.key || "(空)")}</span><span class="qql-bar" style="width:${pct}%"></span><span class="qql-badge">${g.count}</span></li>`;
    }).join("");
    return `<ul class="qql-result qql-histogram">${items}</ul>`;
  }
  if ("Table" in result) {
    if (result.Table.length === 0) return `<div class="qql-result qql-empty">无行</div>`;
    const cols = result.Table[0].fields?.length ?? 0;
    const head = Array.from({ length: cols }, (_, c) => `<th>${esc(`col ${c + 1}`)}</th>`).join("");
    const rows = result.Table.map((r) => {
      const cells = Array.from({ length: cols }, (_, c) => {
        const v = r.fields?.[c];
        return `<td>${v == null ? "" : esc(v)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table class="qql-result qql-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  return "";
}
