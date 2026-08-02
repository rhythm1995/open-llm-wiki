/**
 * 命令系统类型(B-CMD-REGISTRY)。
 * 稳定 id 同时用于:系统菜单 menu-action、⌘K、快捷键。
 */
import type { ComponentType } from "react";
import type { TFunc } from "../i18n";

export type CommandIcon = ComponentType<{
  size?: number | string;
  className?: string;
}>;

export type CommandCategory = "file" | "edit" | "view" | "go" | "plugin";

/** 与 Tauri menu-action / 面板共用的命令 id。 */
export type CommandId =
  | "new-note"
  | "new-canvas"
  | "new-sheet"
  | "open-vault"
  | "save"
  | "close-tab"
  | "reveal"
  | "archive"
  | "settings"
  | "find"
  | "find-vault"
  | "quick-open"
  | "command-palette"
  | "mode-source"
  | "mode-wysiwyg"
  | "toggle-split"
  | "toggle-theme"
  | "toggle-locale"
  | "refresh-index"
  | "view-editor"
  | "view-graph"
  | "view-git"
  | string; // plugin:* 等

export interface AppCommand {
  id: CommandId;
  label: string;
  category: CommandCategory;
  icon: CommandIcon;
  shortcut?: string;
  /** 别名,供过滤 */
  keywords?: string[];
  /** 是否出现在系统菜单(文档用;Rust 侧手写对齐) */
  inMenu?: boolean;
  /** 是否出现在 ⌘K(default true) */
  inPalette?: boolean;
  run: () => void;
}

export type MainViewId = "editor" | "graph" | "git";

export interface CommandDeps {
  t: TFunc;
  openPicker: () => void;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onNewSheet?: () => void;
  onNavigate: (v: MainViewId) => void;
  refreshIndex: () => void;
  saveNow?: () => void;
  openFind?: () => void;
  /** 打开库内全文搜索面板 */
  openVaultSearch?: () => void;
  openQuickOpen?: () => void;
  setEditMode?: (m: "source" | "wysiwyg") => void;
  toggleTheme?: () => void;
  theme?: "light" | "dark";
  toggleLocale?: () => void;
  archiveCurrent?: () => void;
  revealCurrent?: () => void;
  closeCurrentTab?: () => void;
  hasCurrentNote?: boolean;
  hasOpenTab?: boolean;
  canReveal?: boolean;
  openSettings?: () => void;
  toggleSplitLayout?: () => void;
  editorLayout?: "edit" | "split";
  /** 清理未引用附件(媒体索引 orphans → trash,需确认)。 */
  cleanOrphanMedia?: () => void;
  pluginCommands?: { id: string; label: string; run: () => void }[];
}

/** 文件快开条目(笔记 / 画布 / 表格)。 */
export interface FileEntry {
  path: string;
  title: string;
  kind: "note" | "canvas" | "sheet" | "other";
}

export interface RankedFile extends FileEntry {
  score: number;
}

export interface SearchHitView {
  id: number;
  path: string;
  title: string;
  preview: string;
  score: number;
}
