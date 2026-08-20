/**
 * App 热键表 + Find 临时切 source。不挂 App.tsx。
 */
import { describe, it, expect } from "vitest";
import {
  findCloseRestore,
  findOpenPlan,
  matchAppHotkey,
  type AppHotkeyCtx,
  type AppHotkeyInput,
} from "./app-hotkeys";

const editor: AppHotkeyCtx = {
  hasPath: true,
  viewIsEditor: true,
  paletteOpen: false,
};

function key(over: Partial<AppHotkeyInput>): AppHotkeyInput {
  return { key: "k", metaKey: true, ctrlKey: false, shiftKey: false, ...over };
}

describe("matchAppHotkey", () => {
  it("无修饰键不匹配", () => {
    expect(matchAppHotkey(key({ metaKey: false, ctrlKey: false }), editor)).toBeNull();
  });

  it("⌘K / ⌘P / ⌘O / ⌘, 打开面板或设置", () => {
    expect(matchAppHotkey(key({ key: "k" }), editor)).toBe("toggle-commands");
    expect(matchAppHotkey(key({ key: "p" }), editor)).toBe("toggle-files");
    expect(matchAppHotkey(key({ key: "o" }), editor)).toBe("open-vault");
    expect(matchAppHotkey(key({ key: "," }), editor)).toBe("open-settings");
  });

  it("⌘⇧F 库搜,⌘F 文内查找,⌘S 保存", () => {
    expect(matchAppHotkey(key({ key: "f", shiftKey: true }), editor)).toBe(
      "open-search",
    );
    expect(matchAppHotkey(key({ key: "f" }), editor)).toBe("find-in-doc");
    expect(matchAppHotkey(key({ key: "s" }), editor)).toBe("save");
    expect(matchAppHotkey(key({ key: "s", ctrlKey: true, metaKey: false }), editor)).toBe(
      "save",
    );
  });

  it("⌘W 有 path 才关标签", () => {
    expect(matchAppHotkey(key({ key: "w" }), editor)).toBe("close-tab");
    expect(
      matchAppHotkey(key({ key: "w" }), { ...editor, hasPath: false }),
    ).toBeNull();
  });

  it("Ctrl+Tab / ⌘⇧[] / PageUpDown 在编辑器循环标签", () => {
    expect(
      matchAppHotkey(key({ key: "Tab", ctrlKey: true, metaKey: false }), editor),
    ).toBe("cycle-tab-next");
    expect(
      matchAppHotkey(
        key({ key: "Tab", ctrlKey: true, metaKey: false, shiftKey: true }),
        editor,
      ),
    ).toBe("cycle-tab-prev");
    expect(matchAppHotkey(key({ key: "[", shiftKey: true }), editor)).toBe(
      "cycle-tab-prev",
    );
    expect(matchAppHotkey(key({ key: "]", shiftKey: true }), editor)).toBe(
      "cycle-tab-next",
    );
    expect(matchAppHotkey(key({ key: "PageDown" }), editor)).toBe("cycle-tab-next");
    expect(matchAppHotkey(key({ key: "PageUp" }), editor)).toBe("cycle-tab-prev");
  });

  it("面板打开或非编辑器时不循环标签", () => {
    expect(
      matchAppHotkey(key({ key: "Tab", ctrlKey: true, metaKey: false }), {
        ...editor,
        paletteOpen: true,
      }),
    ).toBeNull();
    expect(
      matchAppHotkey(key({ key: "PageDown" }), {
        ...editor,
        viewIsEditor: false,
      }),
    ).toBeNull();
  });
});

describe("findOpenPlan / findCloseRestore", () => {
  it("无笔记或画布/表格不允许 Find", () => {
    expect(findOpenPlan(null, "wysiwyg")).toEqual({ allowed: false });
    expect(findOpenPlan("board.canvas", "source")).toEqual({ allowed: false });
    expect(findOpenPlan("budget.sheet", "wysiwyg")).toEqual({ allowed: false });
  });

  it("markdown 笔记允许;非 source 要临时切过去", () => {
    expect(findOpenPlan("a.md", "wysiwyg")).toEqual({
      allowed: true,
      switchToSource: true,
    });
    expect(findOpenPlan("a.md", "source")).toEqual({
      allowed: true,
      switchToSource: false,
    });
  });

  it("关闭 Find 只还原非 source 的记忆", () => {
    expect(findCloseRestore(null)).toBeNull();
    expect(findCloseRestore("source")).toBeNull();
    expect(findCloseRestore("wysiwyg")).toBe("wysiwyg");
  });
});
