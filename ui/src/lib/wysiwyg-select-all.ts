/**
 * Wysiwyg progressive ⌘/Ctrl+A —— 块编辑器里「先本块、再全文」。
 *
 * 默认 TipTap/ProseMirror 的 selectAll 使用 AllSelection,在 BlockNote 嵌套块
 * 结构(尤其 heading)上经常看起来像「没全选标题内容」。用户在标题内按 ⌘A 时期望
 * 先选中该标题的全部文字(对标 Notion / 多数块编辑器)。
 *
 * 策略:
 *  1. 选区尚未覆盖当前 textblock 全文 → 选中本块
 *  2. 已是本块全文、或已跨多块但未满全文 → 选中整篇正文
 */

export interface SelectAllSnapshot {
  /** 当前选区(无方向) */
  from: number;
  to: number;
  /** 光标所在 textblock 的内容区间 [$start, $end] */
  blockFrom: number;
  blockTo: number;
  /** 文档内从首个到末个 textblock 的可文本选区 */
  docFrom: number;
  docTo: number;
}

export type SelectAllPhase = "block" | "document";

export function planSelectAll(s: SelectAllSnapshot): {
  from: number;
  to: number;
  phase: SelectAllPhase;
} {
  const a = Math.min(s.from, s.to);
  const b = Math.max(s.from, s.to);

  const exactlyBlock = a === s.blockFrom && b === s.blockTo;
  const exactlyDoc = a === s.docFrom && b === s.docTo;
  const spansOutsideBlock = a < s.blockFrom || b > s.blockTo;

  // 已是全文 → 保持全文(幂等,仍由调用方 preventDefault 接管浏览器默认行为)
  if (exactlyDoc) {
    return { from: s.docFrom, to: s.docTo, phase: "document" };
  }

  // 已是本块全文 → 扩到全文
  if (exactlyBlock) {
    return { from: s.docFrom, to: s.docTo, phase: "document" };
  }

  // 跨块选区(非整篇) → 直接全文
  if (spansOutsideBlock) {
    return { from: s.docFrom, to: s.docTo, phase: "document" };
  }

  // 空选区 / 块内部分选 → 先本块
  return { from: s.blockFrom, to: s.blockTo, phase: "block" };
}

/** 鸭类型:只依赖 PM state 上用到的字段,避免把 prosemirror 拉成直接依赖。 */
export interface PmStateLike {
  selection: {
    from: number;
    to: number;
    $from: {
      parent: { isTextblock: boolean };
      start: (depth?: number) => number;
      end: (depth?: number) => number;
      depth: number;
    };
  };
  doc: {
    content: { size: number };
    nodesBetween: (
      from: number,
      to: number,
      f: (node: { isTextblock: boolean; nodeSize: number }, pos: number) => void | boolean,
    ) => void;
  };
}

/**
 * 从 ProseMirror state 抽取 progressive select-all 所需区间。
 * - block: 光标所在 textblock;若父节点非 textblock 则退化为当前选区点。
 * - doc: 文档内首个/末个 textblock 的内容边界(TextSelection 安全区间)。
 */
export function snapshotSelectAll(state: PmStateLike): SelectAllSnapshot {
  const { selection, doc } = state;
  let blockFrom = selection.from;
  let blockTo = selection.to;
  if (selection.$from.parent.isTextblock) {
    blockFrom = selection.$from.start();
    blockTo = selection.$from.end();
  }
  // 父节点非 textblock(如选中图片节点)时,保留当前选区点;后续 plan 会扩到全文。

  let docFrom: number | null = null;
  let docTo: number | null = null;
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isTextblock) return;
    const start = pos + 1;
    const end = pos + node.nodeSize - 1;
    if (docFrom === null) docFrom = start;
    docTo = end;
  });

  if (docFrom === null || docTo === null) {
    docFrom = selection.from;
    docTo = selection.to;
  }

  return {
    from: selection.from,
    to: selection.to,
    blockFrom,
    blockTo,
    docFrom,
    docTo,
  };
}

export interface SelectAllEditorLike {
  prosemirrorState: PmStateLike;
  _tiptapEditor: {
    commands: {
      setTextSelection: (range: number | { from: number; to: number }) => boolean;
    };
  };
}

/** 在 BlockNote / TipTap 编辑器上执行 progressive ⌘A。返回 true 表示已处理。 */
export function applyProgressiveSelectAll(editor: SelectAllEditorLike): boolean {
  const snap = snapshotSelectAll(editor.prosemirrorState);
  const plan = planSelectAll(snap);
  // 空文档:区间可能 from===to,仍 set 一次以吞掉浏览器默认行为
  editor._tiptapEditor.commands.setTextSelection({
    from: plan.from,
    to: plan.to,
  });
  return true;
}

/** 是否为 progressive select-all 应拦截的按键(⌘/Ctrl+A,无 Shift/Alt)。 */
export function isSelectAllHotkey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  if (!(e.metaKey || e.ctrlKey)) return false;
  if (e.shiftKey || e.altKey) return false;
  return e.key.toLowerCase() === "a";
}
