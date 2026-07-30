/**
 * palette-commands —— 命令面板内置动作(可测)。
 *
 * 含 refresh-index(force 自愈)、视图切换、编辑模式、保存、主题/语言、归档等。
 */
import type { ComponentType } from "react";
import {
  Archive,
  ArrowsClockwise,
  Code,
  FileText,
  FloppyDisk,
  FolderOpen,
  GitBranch,
  Graph,
  ListMagnifyingGlass,
  MagnifyingGlass,
  Moon,
  PencilSimple,
  Plus,
  Rectangle,
  Sun,
  TextT,
  Translate,
} from "@phosphor-icons/react";
import type { TFunc } from "./i18n";

export type PaletteIcon = ComponentType<{
  size?: number | string;
  className?: string;
}>;

export interface PaletteCommand {
  id: string;
  label: string;
  icon: PaletteIcon;
  /** 展示用快捷键提示(不负责绑定)。 */
  shortcut?: string;
  run: () => void;
}

export type MainViewId = "editor" | "graph" | "query" | "git";

export interface PaletteCommandDeps {
  t: TFunc;
  openPicker: () => void;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onNavigate: (v: MainViewId) => void;
  refreshIndex: () => void;
  /** 立即保存。 */
  saveNow?: () => void;
  /** 打开文档内查找。 */
  openFind?: () => void;
  /** 切换 source/wysiwyg。 */
  toggleEditMode?: () => void;
  setEditMode?: (m: "source" | "wysiwyg") => void;
  editMode?: "source" | "wysiwyg";
  /** 主题切换。 */
  toggleTheme?: () => void;
  theme?: "light" | "dark";
  /** 语言切换。 */
  toggleLocale?: () => void;
  /** 归档当前笔记。 */
  archiveCurrent?: () => void;
  /** 在 Finder 中显示当前笔记。 */
  revealCurrent?: () => void;
  hasCurrentNote?: boolean;
}

/** 构造 ⌘K 命令列表(非 quickOpen)。 */
export function buildPaletteCommands(
  deps: PaletteCommandDeps,
): PaletteCommand[] {
  const {
    t,
    openPicker,
    onNewNote,
    onNewCanvas,
    onNavigate,
    refreshIndex,
  } = deps;
  const cmds: PaletteCommand[] = [
    {
      id: "open",
      label: t("palette.action.openVault"),
      icon: FolderOpen as PaletteIcon,
      shortcut: "⌘O",
      run: () => openPicker(),
    },
    {
      id: "new",
      label: t("palette.action.newNote"),
      icon: Plus as PaletteIcon,
      shortcut: "⌘N",
      run: () => onNewNote(),
    },
    {
      id: "new-canvas",
      label: t("palette.action.newCanvas"),
      icon: Rectangle as PaletteIcon,
      run: () => onNewCanvas(),
    },
    {
      id: "refresh-index",
      label: t("palette.action.refreshIndex"),
      icon: ArrowsClockwise as PaletteIcon,
      run: () => refreshIndex(),
    },
  ];

  if (deps.saveNow) {
    cmds.push({
      id: "save",
      label: t("palette.action.save"),
      icon: FloppyDisk as PaletteIcon,
      shortcut: "⌘S",
      run: () => deps.saveNow!(),
    });
  }
  if (deps.openFind) {
    cmds.push({
      id: "find",
      label: t("palette.action.find"),
      icon: MagnifyingGlass as PaletteIcon,
      shortcut: "⌘F",
      run: () => deps.openFind!(),
    });
  }
  if (deps.setEditMode) {
    cmds.push({
      id: "mode-source",
      label: t("palette.action.modeSource"),
      icon: Code as PaletteIcon,
      run: () => deps.setEditMode!("source"),
    });
    cmds.push({
      id: "mode-wysiwyg",
      label: t("palette.action.modeWysiwyg"),
      icon: TextT as PaletteIcon,
      run: () => deps.setEditMode!("wysiwyg"),
    });
  } else if (deps.toggleEditMode) {
    cmds.push({
      id: "toggle-edit-mode",
      label: t("palette.action.toggleEditMode"),
      icon: PencilSimple as PaletteIcon,
      run: () => deps.toggleEditMode!(),
    });
  }
  if (deps.archiveCurrent && deps.hasCurrentNote) {
    cmds.push({
      id: "archive",
      label: t("palette.action.archive"),
      icon: Archive as PaletteIcon,
      run: () => deps.archiveCurrent!(),
    });
  }
  if (deps.revealCurrent && deps.hasCurrentNote) {
    cmds.push({
      id: "reveal",
      label: t("palette.action.reveal"),
      icon: FolderOpen as PaletteIcon,
      run: () => deps.revealCurrent!(),
    });
  }
  if (deps.toggleTheme) {
    cmds.push({
      id: "toggle-theme",
      label:
        deps.theme === "dark"
          ? t("toolbar.theme.light")
          : t("toolbar.theme.dark"),
      icon: (deps.theme === "dark" ? Sun : Moon) as PaletteIcon,
      run: () => deps.toggleTheme!(),
    });
  }
  if (deps.toggleLocale) {
    cmds.push({
      id: "toggle-locale",
      label: t("palette.action.toggleLocale"),
      icon: Translate as PaletteIcon,
      run: () => deps.toggleLocale!(),
    });
  }

  cmds.push(
    {
      id: "v-editor",
      label: `${t("palette.action.viewPrefix")}${t("view.editor")}`,
      icon: PencilSimple as PaletteIcon,
      run: () => onNavigate("editor"),
    },
    {
      id: "v-graph",
      label: `${t("palette.action.viewPrefix")}${t("view.graph")}`,
      icon: Graph as PaletteIcon,
      run: () => onNavigate("graph"),
    },
    {
      id: "v-query",
      label: `${t("palette.action.viewPrefix")}${t("view.query")}`,
      icon: ListMagnifyingGlass as PaletteIcon,
      run: () => onNavigate("query"),
    },
    {
      id: "v-git",
      label: `${t("palette.action.viewPrefix")}${t("view.git")}`,
      icon: GitBranch as PaletteIcon,
      run: () => onNavigate("git"),
    },
  );

  return cmds;
}

export function filterPaletteCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const s = query.trim().toLowerCase();
  if (!s) return commands;
  return commands.filter(
    (a) =>
      a.label.toLowerCase().includes(s) ||
      a.id.toLowerCase().includes(s) ||
      (a.shortcut?.toLowerCase().includes(s) ?? false),
  );
}

export function hasRefreshIndexCommand(commands: PaletteCommand[]): boolean {
  return commands.some((c) => c.id === "refresh-index");
}

export { FileText };
