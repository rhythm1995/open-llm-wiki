/**
 * App 壳热键 / Find 模式切换 —— 从 App.tsx 抽出的纯判定。
 *
 * 不挂整棵 App:热键表 + ⌘F 临时切 source 的契约在这里测。
 */
import { isCanvasPath } from "./canvas";
import type { EditMode } from "./edit-mode";
import { isSheetPath } from "./sheet";

export type AppHotkeyAction =
  | "toggle-commands"
  | "toggle-files"
  | "open-vault"
  | "open-search"
  | "open-settings"
  | "close-tab"
  | "find-in-doc"
  | "save"
  | "cycle-tab-next"
  | "cycle-tab-prev";

export interface AppHotkeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface AppHotkeyCtx {
  /** 有当前笔记才允许 ⌘W 关标签。 */
  hasPath: boolean;
  /** 标签循环只在编辑器、且命令面板未挡时生效。 */
  viewIsEditor: boolean;
  paletteOpen: boolean;
}

/** 把一次 keydown 映射成壳动作;不匹配返回 null(调用方不 preventDefault)。 */
export function matchAppHotkey(
  e: AppHotkeyInput,
  ctx: AppHotkeyCtx,
): AppHotkeyAction | null {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return null;
  const k = e.key.toLowerCase();

  if (ctx.viewIsEditor && !ctx.paletteOpen) {
    if (e.ctrlKey && e.key === "Tab") {
      return e.shiftKey ? "cycle-tab-prev" : "cycle-tab-next";
    }
    if (e.shiftKey && e.key === "[") return "cycle-tab-prev";
    if (e.shiftKey && e.key === "]") return "cycle-tab-next";
    if (e.key === "PageUp") return "cycle-tab-prev";
    if (e.key === "PageDown") return "cycle-tab-next";
  }

  if (k === "k" && !e.shiftKey) return "toggle-commands";
  if (k === "p" && !e.shiftKey) return "toggle-files";
  if (k === "o" && !e.shiftKey) return "open-vault";
  if (k === "f" && e.shiftKey) return "open-search";
  if (k === "f" && !e.shiftKey) return "find-in-doc";
  if (k === "," && !e.shiftKey) return "open-settings";
  if (k === "s") return "save";
  if (k === "w" && !e.shiftKey) return ctx.hasPath ? "close-tab" : null;
  return null;
}

/** ⌘F:画布/表格没有源码查找;否则进 editor,非 source 时临时切过去。 */
export function findOpenPlan(
  path: string | null,
  editMode: EditMode,
): { allowed: false } | { allowed: true; switchToSource: boolean } {
  if (!path || isCanvasPath(path) || isSheetPath(path)) {
    return { allowed: false };
  }
  return { allowed: true, switchToSource: editMode !== "source" };
}

/** 关闭 Find 时还原打开前的模式;本来就是 source 则不动。 */
export function findCloseRestore(prev: EditMode | null): EditMode | null {
  return prev && prev !== "source" ? prev : null;
}
