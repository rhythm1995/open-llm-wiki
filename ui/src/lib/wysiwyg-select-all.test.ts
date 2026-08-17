import { describe, it, expect } from "vitest";
import {
  planSelectAll,
  snapshotSelectAll,
  isSelectAllHotkey,
  type PmStateLike,
} from "./wysiwyg-select-all";

describe("planSelectAll", () => {
  const base = {
    blockFrom: 10,
    blockTo: 20,
    docFrom: 2,
    docTo: 100,
  };

  it("空选区(光标在块内) → 选中本块", () => {
    const r = planSelectAll({ ...base, from: 15, to: 15 });
    expect(r).toEqual({ from: 10, to: 20, phase: "block" });
  });

  it("块内部分选区 → 选中本块", () => {
    const r = planSelectAll({ ...base, from: 12, to: 16 });
    expect(r).toEqual({ from: 10, to: 20, phase: "block" });
  });

  it("已是本块全文 → 扩到全文", () => {
    const r = planSelectAll({ ...base, from: 10, to: 20 });
    expect(r).toEqual({ from: 2, to: 100, phase: "document" });
  });

  it("跨块选区 → 全文", () => {
    const r = planSelectAll({ ...base, from: 8, to: 30 });
    expect(r).toEqual({ from: 2, to: 100, phase: "document" });
  });

  it("已是全文 → 保持全文", () => {
    const r = planSelectAll({ ...base, from: 2, to: 100 });
    expect(r).toEqual({ from: 2, to: 100, phase: "document" });
  });

  it("反向选区(to < from) 仍按区间判断", () => {
    const r = planSelectAll({ ...base, from: 16, to: 12 });
    expect(r).toEqual({ from: 10, to: 20, phase: "block" });
  });

  it("单块文档(block === doc) 第一次选块、第二次仍全文(同区间)", () => {
    const one = { blockFrom: 1, blockTo: 5, docFrom: 1, docTo: 5 };
    expect(planSelectAll({ ...one, from: 3, to: 3 }).phase).toBe("block");
    expect(planSelectAll({ ...one, from: 1, to: 5 }).phase).toBe("document");
  });
});

describe("snapshotSelectAll", () => {
  function makeState(opts: {
    from: number;
    to: number;
    textblock?: boolean;
    blockFrom?: number;
    blockTo?: number;
    textblocks?: Array<{ pos: number; size: number }>;
  }): PmStateLike {
    const textblock = opts.textblock !== false;
    const blockFrom = opts.blockFrom ?? 10;
    const blockTo = opts.blockTo ?? 20;
    const textblocks = opts.textblocks ?? [{ pos: 9, size: 12 }]; // content 10..20
    return {
      selection: {
        from: opts.from,
        to: opts.to,
        $from: {
          parent: { isTextblock: textblock },
          start: () => blockFrom,
          end: () => blockTo,
          depth: 1,
        },
      },
      doc: {
        content: { size: 200 },
        nodesBetween: (_f, _t, fn) => {
          for (const tb of textblocks) {
            fn({ isTextblock: true, nodeSize: tb.size }, tb.pos);
          }
        },
      },
    };
  }

  it("在 textblock 内 → block 取 $from.start/end,doc 扫 nodesBetween", () => {
    const snap = snapshotSelectAll(
      makeState({
        from: 14,
        to: 14,
        textblocks: [
          { pos: 1, size: 10 }, // content 2..10
          { pos: 20, size: 8 }, // content 21..27
        ],
      }),
    );
    expect(snap.blockFrom).toBe(10);
    expect(snap.blockTo).toBe(20);
    expect(snap.docFrom).toBe(2);
    expect(snap.docTo).toBe(27);
    expect(snap.from).toBe(14);
  });

  it("父节点非 textblock → block 退化为当前选区点", () => {
    const snap = snapshotSelectAll(
      makeState({ from: 5, to: 5, textblock: false }),
    );
    expect(snap.blockFrom).toBe(5);
    expect(snap.blockTo).toBe(5);
  });
});

describe("isSelectAllHotkey", () => {
  it("识别 ⌘A / Ctrl+A", () => {
    expect(
      isSelectAllHotkey({
        key: "a",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(true);
    expect(
      isSelectAllHotkey({
        key: "A",
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(true);
  });

  it("排除 Shift/Alt 组合", () => {
    expect(
      isSelectAllHotkey({
        key: "a",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toBe(false);
  });
});
