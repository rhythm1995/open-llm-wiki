/**
 * CommandPalette —— ⌘K 命令面板(Radix Dialog)。
 *
 * 内置动作来自 `palette-commands.ts`(含 refresh-index force 自愈)。
 * quickOpen(⌘P) 仅笔记列表。
 */
import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText } from "@phosphor-icons/react";
import type { VaultActions } from "../lib/store";
import type { VaultSnapshot } from "../lib/ipc";
import type { TFunc } from "../lib/i18n";
import { cn } from "../lib/cn";
import {
  buildPaletteCommands,
  filterPaletteCommands,
  type MainViewId,
} from "../lib/palette-commands";

export type MainView = MainViewId;

/** commands = ⌘K 命令+笔记;quickOpen = ⌘P 仅快速打开笔记。 */
export type PaletteMode = "commands" | "quickOpen";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onNavigate: (v: MainView) => void;
  t: TFunc;
  /** 默认 commands;quickOpen 时隐藏动作行、笔记优先。 */
  mode?: PaletteMode;
  /** 扩展命令依赖(保存/模式/主题等)。 */
  commandExtras?: Omit<
    import("../lib/palette-commands").PaletteCommandDeps,
    | "t"
    | "openPicker"
    | "onNewNote"
    | "onNewCanvas"
    | "onNavigate"
    | "refreshIndex"
  >;
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
  mode = "commands",
  commandExtras,
}: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const quick = mode === "quickOpen";

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

  const actions2 = useMemo(() => {
    if (quick) return [];
    const all = buildPaletteCommands({
      t,
      openPicker: () => actions.openPicker(),
      onNewNote,
      onNewCanvas,
      onNavigate,
      refreshIndex: () => actions.refreshIndex(),
      ...commandExtras,
    });
    return filterPaletteCommands(all, q);
  }, [q, actions, onNavigate, onNewCanvas, onNewNote, t, quick, commandExtras]);

  const total = actions2.length + filtered.length;

  useEffect(() => {
    setSel(0);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open, mode]);

  const activate = (i: number) => {
    if (i < actions2.length) {
      actions2[i].run();
    } else {
      const node = filtered[i - actions2.length];
      if (node) {
        actions.selectNote(node.path);
        onNavigate("editor");
      }
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
          <Dialog.Title className="sr-only">
            {quick ? t("palette.quickOpenTitle") : t("palette.title")}
          </Dialog.Title>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              quick ? t("palette.quickOpenPlaceholder") : t("palette.placeholder")
            }
            className="w-full border-b border-crust bg-transparent px-3 py-2.5 text-[14px] text-text outline-none placeholder:text-overlay"
          />
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {actions2.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  data-palette-cmd={a.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => activate(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                    sel === i ? "bg-surface text-text" : "text-subtext",
                  )}
                >
                  <Icon size={14} className="text-overlay" />
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {a.shortcut && (
                    <span className="ml-2 shrink-0 text-[11px] text-overlay">
                      {a.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length > 0 && actions2.length > 0 && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-overlay">
                {t("palette.section.notes")}
              </div>
            )}
            {quick && filtered.length > 0 && (
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
