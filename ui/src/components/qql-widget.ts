/**
 * qql-widget —— CodeMirror 6 内联 ```qql 块求值结果装饰。
 *
 * 机制:一个 StateField(`qqlResultsField`)缓存 query→result,Editor 侧异步求值后用
 * `setQqlResult` effect 写入;一个 ViewPlugin 扫描 doc 的 qql 围栏块,在每个块**闭围栏
 * 下一行行首**放一个块级 widget(行首位置 → CM 渲染为块级元素),显示缓存结果(无则占位)。
 *
 * 结果 HTML 由纯 `resultToHtml` 生成(与阅读视图同一渲染器 → 两路一致)。widget 不可编辑、
 * 忽略事件,不影响光标/选区/撤销。
 */
import {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { findQqlBlocks, resultToHtml } from "../lib/qql-block";
import type { ResultSet } from "../lib/ipc";

export type QqlResultEntry = ResultSet | { error: string };

/** 写入某 query 的求值结果(Editor 异步求值后 dispatch)。 */
export const setQqlResult = StateEffect.define<{ query: string; result: QqlResultEntry }>();

/** query → result 缓存;widget 据此渲染。 */
export const qqlResultsField = StateField.define<Map<string, QqlResultEntry>>({
  create: () => new Map(),
  update(value, tr) {
    let next: Map<string, QqlResultEntry> | null = null;
    for (const e of tr.effects) {
      if (e.is(setQqlResult)) {
        if (!next) next = new Map(value);
        next.set(e.value.query, e.value.result);
      }
    }
    return next ?? value;
  },
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

class QqlResultWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }
  eq(other: QqlResultWidget) {
    return this.html === other.html;
  }
  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-qql-result";
    div.setAttribute("contenteditable", "false");
    div.innerHTML = this.html;
    return div;
  }
  ignoreEvent() {
    return true;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const blocks = findQqlBlocks(doc.toString());
  const results = view.state.field(qqlResultsField);
  const builder = new RangeSetBuilder<Decoration>();
  const totalLines = doc.lines;
  for (const b of blocks) {
    if (!b.query) continue;
    // 块 widget 放在闭围栏**下一行的行首**(行首 → CM 块级 widget);闭围栏为文末行则放文末。
    const cmLine = b.endLine + 2; // endLine 0-based → 下一行 1-based
    const pos = cmLine <= totalLines ? doc.line(cmLine).from : doc.length;
    const entry = results.get(b.query);
    const html = entry
      ? "error" in entry
        ? `<div class="qql-error">⚠ ${escapeHtml(entry.error)}</div>`
        : resultToHtml(entry)
      : `<div class="qql-pending">求值中…</div>`;
    builder.add(pos, pos, Decoration.widget({ widget: new QqlResultWidget(html), side: -1 }));
  }
  return builder.finish();
}

export const qqlInline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      // doc 变化(块区间变)或结果缓存变(求值回填)都要重建装饰。
      if (u.docChanged || u.state.field(qqlResultsField) !== u.startState.field(qqlResultsField)) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** 编辑器扩展包:结果缓存字段 + 装饰插件。 */
export const qqlInlineExtension = [qqlResultsField, qqlInline];
