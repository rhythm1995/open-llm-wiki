/**
 * CommandPalette —— ⌘K 命令面板(Radix Dialog)。
 *
 * 一个输入框模糊过滤所有笔记 + 内置动作(打开 vault、新建、切换视图)。上下键移动、
 * 回车激活。参考 Obsidian/Raycast 的命令面板范式。
 */
import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FolderOpen,
  Plus,
  PencilSimple,
  Graph,
  ListMagnifyingGlass,
  MagnifyingGlass,
  FileText,
  GitBranch,
  Rectangle,
} from "@phosphor-icons/react";
import type { VaultActions } from "../lib/store";
import type { VaultSnapshot } from "../lib/ipc";
import type { TFunc } from "../lib/i18n";
import { cn } from "../lib/cn";

export type MainView = "editor" | "graph" | "query" | "search" | "git";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onNavigate: (v: MainView) => void;
  t: TFunc;
}

export function CommandPalette({
  open,
  onOpenChange,
  snapshot,
  actions,
  onNewNote,
  onNewCanvas,
  onNavigate,
  t,
}: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const notes = snapshot?.nodes ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(s) ||
        n.path.toLowerCase().includes(s),
    );
  }, [notes, q]);

  const actions2 = useMemo(
    () => [
      { id: "open", label: t("palette.action.openVault"), icon: FolderOpen, run: () => actions.openPicker() },
      { id: "new", label: t("palette.action.newNote"), icon: Plus, run: () => onNewNote() },
      { id: "new-canvas", label: t("palette.action.newCanvas"), icon: Rectangle, run: () => onNewCanvas() },
      { id: "v-editor", label: `${t("palette.action.viewPrefix")}${t("view.editor")}`, icon: PencilSimple, run: () => onNavigate("editor") },
      { id: "v-graph", label: `${t("palette.action.viewPrefix")}${t("view.graph")}`, icon: Graph, run: () => onNavigate("graph") },
      { id: "v-query", label: `${t("palette.action.viewPrefix")}${t("view.query")}`, icon: ListMagnifyingGlass, run: () => onNavigate("query") },
      { id: "v-search", label: `${t("palette.action.viewPrefix")}${t("view.search")}`, icon: MagnifyingGlass, run: () => onNavigate("search") },
      { id: "v-git", label: `${t("palette.action.viewPrefix")}${t("view.git")}`, icon: GitBranch, run: () => onNavigate("git") },
    ].filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase())),
    [q, actions, onNavigate, onNewCanvas, t],
  );

  const total = actions2.length + filtered.length;

  useEffect(() => {
    setSel(0);
  }, [q, open]);

  const activate = (i: number) => {
    if (i < actions2.length) {
      actions2[i].run();
    } else {
      const node = filtered[i - actions2.length];
      if (node) actions.selectNote(node.path);
    }
    onOpenChange(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(total, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + total) % Math.max(total, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(sel);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-[20%] w-[560px] max-w-[90vw] -translate-x-1/2 rounded-lg border border-surface2 bg-mantle shadow-2xl outline-none">
          <Dialog.Title className="sr-only">{t("palette.title")}</Dialog.Title>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("palette.placeholder")}
            className="w-full border-b border-crust bg-transparent px-3 py-2.5 text-[14px] text-text outline-none placeholder:text-overlay"
          />
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {actions2.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => activate(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                    sel === i ? "bg-surface text-text" : "text-subtext",
                  )}
                >
                  <Icon size={14} className="text-overlay" />
                  {a.label}
                </button>
              );
            })}
            {filtered.length > 0 && actions2.length > 0 && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-overlay">
                {t("palette.section.notes")}
              </div>
            )}
            {filtered.map((n, j) => {
              const i = actions2.length + j;
              return (
                <button
                  key={n.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => activate(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                    sel === i ? "bg-surface text-text" : "text-subtext",
                  )}
                >
                  <FileText size={14} className="text-blue" />
                  <span className="truncate">{n.title}</span>
                  <span className="ml-auto truncate text-[11px] text-overlay">
                    {n.path}
                  </span>
                </button>
              );
            })}
            {total === 0 && (
              <p className="px-3 py-3 text-[12px] text-overlay">{t("palette.empty")}</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
