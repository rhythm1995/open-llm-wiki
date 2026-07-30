/**
 * palette-commands —— 命令面板内置动作的纯列表构造(可测)。
 *
 * 含 `refresh-index`:绑定 force 全量索引自愈(对应 store.actions.refreshIndex →
 * index_vault(force=true)),使 silent 漏事件时用户可从 ⌘K 触发,无需 re-open vault。
 */
import type { ComponentType } from "react";
import {
  ArrowsClockwise,
  FileText,
  FolderOpen,
  GitBranch,
  Graph,
  ListMagnifyingGlass,
  PencilSimple,
  Plus,
  Rectangle,
} from "@phosphor-icons/react";
import type { TFunc } from "./i18n";

export type PaletteIcon = ComponentType<{ size?: number | string; className?: string }>;

export interface PaletteCommand {
  id: string;
  label: string;
  icon: PaletteIcon;
  run: () => void;
}

export type MainViewId = "editor" | "graph" | "query" | "git";

export interface PaletteCommandDeps {
  t: TFunc;
  openPicker: () => void;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onNavigate: (v: MainViewId) => void;
  /** 必须是 force 全量自愈路径(store.actions.refreshIndex)。 */
  refreshIndex: () => void;
}

/** 构造 ⌘K 命令列表(非 quickOpen)。 */
export function buildPaletteCommands(deps: PaletteCommandDeps): PaletteCommand[] {
  const { t, openPicker, onNewNote, onNewCanvas, onNavigate, refreshIndex } = deps;
  return [
    {
      id: "open",
      label: t("palette.action.openVault"),
      icon: FolderOpen as PaletteIcon,
      run: () => openPicker(),
    },
    {
      id: "new",
      label: t("palette.action.newNote"),
      icon: Plus as PaletteIcon,
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
  ];
}

/** 按查询串过滤命令(大小写不敏感子串)。 */
export function filterPaletteCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const s = query.trim().toLowerCase();
  if (!s) return commands;
  return commands.filter((a) => a.label.toLowerCase().includes(s));
}

/** 是否包含 force 自愈命令(结构断言用)。 */
export function hasRefreshIndexCommand(commands: PaletteCommand[]): boolean {
  return commands.some((c) => c.id === "refresh-index");
}

// re-export FileText for notes section consumers if needed
export { FileText };
