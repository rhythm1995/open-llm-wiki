/**
 * Sidebar —— 左栏:vault 选择 + 文件夹树 + 笔记列表。
 *
 * 树由扁平的 VaultEntry[] 构建(后端给出相对路径 + is_dir)。目录可折叠;
 * 文件点击切换当前笔记。顶部是"打开 vault"与"新建笔记"动作。
 *
 * 功能参考 Obsidian 的文件浏览器(折叠树 + 当前笔记高亮 + 类型徽标)。
 */
import { useMemo, useState } from "react";
import {
  FolderOpen,
  Folder,
  FileText,
  Plus,
  Hash,
  PencilSimple,
  Trash,
  Rectangle,
} from "@phosphor-icons/react";
import type { VaultEntry } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

function buildTree(entries: VaultEntry[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isDir: true,
    children: new Map(),
  };
  for (const e of entries) {
    const parts = e.path.split("/");
    let cur = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isDir = isLast ? e.is_dir : true;
      if (!cur.children.has(part)) {
        cur.children.set(part, {
          name: part,
          path: acc,
          isDir,
          children: new Map(),
        });
      }
      cur = cur.children.get(part)!;
    }
  }
  return root;
}

interface Props {
  entries: VaultEntry[];
  currentPath: string | null;
  actions: VaultActions;
  onNewNote: () => void;
  onNewCanvas: () => void;
  t: TFunc;
}

export function Sidebar({ entries, currentPath, actions, onNewNote, onNewCanvas, t }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(entries), [entries]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.isDir) {
      const isOpen = expanded.has(node.path);
      const kids = [...node.children.values()].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      // 空目录或根目录不渲染自身外壳。
      if (node.path === "") {
        return (
          <div key="root">{kids.map((k) => renderNode(k, depth))}</div>
        );
      }
      return (
        <div key={node.path}>
          <button
            onClick={() => toggle(node.path)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px]",
              "text-subtext hover:bg-surface",
            )}
            style={{ paddingLeft: depth * 12 + 6 }}
          >
            {isOpen ? (
              <FolderOpen size={15} className="text-yellow shrink-0" weight="fill" />
            ) : (
              <Folder size={15} className="text-yellow shrink-0" weight="fill" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {isOpen && kids.map((k) => renderNode(k, depth + 1))}
        </div>
      );
    }
    // 文件
    const active = currentPath === node.path;
    const isCanvas = /\.canvas$/i.test(node.name);
    const stem = node.name.replace(/\.(md|canvas)$/i, "");
    const onRename = (e: React.MouseEvent) => {
      e.stopPropagation();
      const next = window.prompt(t("sidebar.renamePrompt"), stem);
      if (next && next.trim()) void actions.renameNote(node.path, next.trim());
    };
    const onDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      // 软删:移入回收站,可从回收站恢复(或彻底清空)。
      if (window.confirm(t("sidebar.trashConfirm", { name: stem })))
        void actions.trashNote(node.path);
    };
    return (
      <div
        key={node.path}
        onClick={() => actions.selectNote(node.path)}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px]",
          active ? "bg-surface2 text-text" : "text-subtext hover:bg-surface",
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        {isCanvas ? (
          <Rectangle size={15} className="shrink-0 text-mauve" weight="fill" />
        ) : (
          <FileText size={15} className="shrink-0 text-blue" />
        )}
        <span className="min-w-0 flex-1 truncate">{stem}</span>
        <button
          onClick={onRename}
          title={t("sidebar.rename")}
          className="shrink-0 rounded p-0.5 text-overlay opacity-0 hover:text-text group-hover:opacity-100"
        >
          <PencilSimple size={12} />
        </button>
        <button
          onClick={onDelete}
          title={t("sidebar.delete")}
          className="shrink-0 rounded p-0.5 text-overlay opacity-0 hover:text-red group-hover:opacity-100"
        >
          <Trash size={12} />
        </button>
      </div>
    );
  };

  const onNew = () => onNewNote();

  return (
    <div className="flex h-full flex-col bg-mantle">
      <div className="flex items-center gap-1 border-b border-crust px-2 py-2">
        <button
          onClick={() => void actions.openPicker()}
          className="flex items-center gap-1.5 rounded bg-surface px-2 py-1 text-[12px] text-text hover:bg-surface2"
        >
          <FolderOpen size={14} weight="bold" />
          {t("sidebar.openVault")}
        </button>
        <button
          onClick={onNew}
          className="flex items-center gap-1 rounded bg-surface px-2 py-1 text-[12px] text-text hover:bg-surface2"
          title={t("sidebar.newNote")}
        >
          <Plus size={14} weight="bold" />
          {t("sidebar.newNoteShort")}
        </button>
        <button
          onClick={onNewCanvas}
          className="flex items-center gap-1 rounded bg-surface px-2 py-1 text-[12px] text-text hover:bg-surface2"
          title={t("sidebar.newCanvas")}
        >
          <Rectangle size={14} weight="bold" />
          {t("sidebar.newCanvas")}
        </button>
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wide text-overlay">
        <Hash size={12} />
        {t("sidebar.files")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-[12px] text-overlay">
            {t("sidebar.empty")}
          </p>
        ) : (
          renderNode(tree, 0)
        )}
      </div>
    </div>
  );
}
