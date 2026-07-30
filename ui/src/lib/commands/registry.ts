/**
 * 应用命令注册表 —— 构建可执行 AppCommand 列表。
 */
import {
  Archive,
  ArrowsClockwise,
  Code,
  Columns,
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
  PuzzlePiece,
  Rectangle,
  Sun,
  Table,
  TextT,
  Gear,
  Translate,
  X,
} from "@phosphor-icons/react";
import type { AppCommand, CommandDeps, CommandIcon } from "./types";

/** 从依赖构建完整命令表(含 only-menu / only-palette 项)。 */
export function buildAppCommands(deps: CommandDeps): AppCommand[] {
  const { t } = deps;
  const cmds: AppCommand[] = [
    {
      id: "open-vault",
      label: t("palette.action.openVault"),
      category: "file",
      icon: FolderOpen as CommandIcon,
      shortcut: "⌘O",
      keywords: ["vault", "open", "打开"],
      inMenu: true,
      run: () => deps.openPicker(),
    },
    {
      id: "new-note",
      label: t("palette.action.newNote"),
      category: "file",
      icon: Plus as CommandIcon,
      shortcut: "⌘N",
      keywords: ["new", "新建"],
      inMenu: true,
      run: () => deps.onNewNote(),
    },
    {
      id: "new-canvas",
      label: t("palette.action.newCanvas"),
      category: "file",
      icon: Rectangle as CommandIcon,
      keywords: ["canvas", "画布"],
      inMenu: true,
      run: () => deps.onNewCanvas(),
    },
  ];

  if (deps.onNewSheet) {
    cmds.push({
      id: "new-sheet",
      label: t("palette.action.newSheet"),
      category: "file",
      icon: Table as CommandIcon,
      keywords: ["sheet", "spreadsheet", "表格"],
      inMenu: true,
      run: () => deps.onNewSheet!(),
    });
  }

  if (deps.saveNow) {
    cmds.push({
      id: "save",
      label: t("palette.action.save"),
      category: "file",
      icon: FloppyDisk as CommandIcon,
      shortcut: "⌘S",
      inMenu: true,
      run: () => deps.saveNow!(),
    });
  }

  if (deps.closeCurrentTab && deps.hasOpenTab) {
    cmds.push({
      id: "close-tab",
      label: t("palette.action.closeTab"),
      category: "file",
      icon: X as CommandIcon,
      shortcut: "⌘W",
      inMenu: true,
      run: () => deps.closeCurrentTab!(),
    });
  }

  if (deps.revealCurrent && deps.hasCurrentNote && deps.canReveal !== false) {
    cmds.push({
      id: "reveal",
      label: t("palette.action.reveal"),
      category: "file",
      icon: FolderOpen as CommandIcon,
      inMenu: true,
      run: () => deps.revealCurrent!(),
    });
  }

  if (deps.archiveCurrent && deps.hasCurrentNote) {
    cmds.push({
      id: "archive",
      label: t("palette.action.archive"),
      category: "file",
      icon: Archive as CommandIcon,
      inMenu: true,
      run: () => deps.archiveCurrent!(),
    });
  }

  if (deps.openSettings) {
    cmds.push({
      id: "settings",
      label: t("palette.action.settings"),
      category: "file",
      icon: Gear as CommandIcon,
      shortcut: "⌘,",
      keywords: ["preferences", "设置"],
      inMenu: true,
      run: () => deps.openSettings!(),
    });
  }

  if (deps.openFind) {
    cmds.push({
      id: "find",
      label: t("palette.action.find"),
      category: "edit",
      icon: MagnifyingGlass as CommandIcon,
      shortcut: "⌘F",
      inMenu: true,
      run: () => deps.openFind!(),
    });
  }

  if (deps.openVaultSearch) {
    cmds.push({
      id: "find-vault",
      label: t("palette.action.findVault"),
      category: "edit",
      icon: MagnifyingGlass as CommandIcon,
      shortcut: "⌘⇧F",
      keywords: ["search", "全文", "库内"],
      inMenu: true,
      run: () => deps.openVaultSearch!(),
    });
  }

  if (deps.openQuickOpen) {
    cmds.push({
      id: "quick-open",
      label: t("palette.action.quickOpen"),
      category: "go",
      icon: FileText as CommandIcon,
      shortcut: "⌘P",
      inPalette: true,
      inMenu: false,
      run: () => deps.openQuickOpen!(),
    });
  }

  if (deps.setEditMode) {
    cmds.push(
      {
        id: "mode-source",
        label: t("palette.action.modeSource"),
        category: "edit",
        icon: Code as CommandIcon,
        inMenu: true,
        run: () => deps.setEditMode!("source"),
      },
      {
        id: "mode-wysiwyg",
        label: t("palette.action.modeWysiwyg"),
        category: "edit",
        icon: TextT as CommandIcon,
        inMenu: true,
        run: () => deps.setEditMode!("wysiwyg"),
      },
    );
  }

  if (deps.toggleSplitLayout) {
    cmds.push({
      id: "toggle-split",
      label:
        deps.editorLayout === "split"
          ? t("palette.action.splitOff")
          : t("palette.action.splitOn"),
      category: "edit",
      icon: Columns as CommandIcon,
      inMenu: true,
      run: () => deps.toggleSplitLayout!(),
    });
  }

  cmds.push({
    id: "refresh-index",
    label: t("palette.action.refreshIndex"),
    category: "view",
    icon: ArrowsClockwise as CommandIcon,
    keywords: ["index", "索引", "刷新"],
    inMenu: true,
    run: () => deps.refreshIndex(),
  });

  if (deps.toggleTheme) {
    cmds.push({
      id: "toggle-theme",
      label:
        deps.theme === "dark"
          ? t("toolbar.theme.light")
          : t("toolbar.theme.dark"),
      category: "view",
      icon: (deps.theme === "dark" ? Sun : Moon) as CommandIcon,
      inMenu: true,
      run: () => deps.toggleTheme!(),
    });
  }

  if (deps.toggleLocale) {
    cmds.push({
      id: "toggle-locale",
      label: t("palette.action.toggleLocale"),
      category: "view",
      icon: Translate as CommandIcon,
      inMenu: false,
      run: () => deps.toggleLocale!(),
    });
  }

  cmds.push(
    {
      id: "view-editor",
      label: `${t("palette.action.viewPrefix")}${t("view.editor")}`,
      category: "view",
      icon: PencilSimple as CommandIcon,
      inMenu: true,
      run: () => deps.onNavigate("editor"),
    },
    {
      id: "view-graph",
      label: `${t("palette.action.viewPrefix")}${t("view.graph")}`,
      category: "view",
      icon: Graph as CommandIcon,
      inMenu: true,
      run: () => deps.onNavigate("graph"),
    },
    {
      id: "view-query",
      label: `${t("palette.action.viewPrefix")}${t("view.query")}`,
      category: "view",
      icon: ListMagnifyingGlass as CommandIcon,
      inMenu: true,
      run: () => deps.onNavigate("query"),
    },
    {
      id: "view-git",
      label: `${t("palette.action.viewPrefix")}${t("view.git")}`,
      category: "view",
      icon: GitBranch as CommandIcon,
      inMenu: true,
      run: () => deps.onNavigate("git"),
    },
  );

  for (const pc of deps.pluginCommands ?? []) {
    cmds.push({
      id: `plugin:${pc.id}`,
      label: pc.label,
      category: "plugin",
      icon: PuzzlePiece as CommandIcon,
      inMenu: false,
      run: () => pc.run(),
    });
  }

  return cmds;
}

/** 仅面板展示的命令。 */
export function paletteCommandsFrom(cmds: readonly AppCommand[]): AppCommand[] {
  return cmds.filter((c) => c.inPalette !== false);
}

/** 系统菜单应有的 id 列表(文档/测试用)。 */
export function menuCommandIds(cmds: readonly AppCommand[]): string[] {
  return cmds.filter((c) => c.inMenu).map((c) => c.id);
}
