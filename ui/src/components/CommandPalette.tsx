/**
 * CommandPalette —— 命令 / 文件快开 / 库内全文(B-PALETTE-V2)。
 *
 * - commands(⌘K):命令 + 附带文件结果
 * - files(⌘P):仅文件快开
 * - search(⌘⇧F):ipc.searchNotes 正文检索
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FileText,
  MagnifyingGlass,
  Rectangle,
  Table,
} from "@phosphor-icons/react";
import type { VaultActions } from "../lib/store";
import type { NodeOut, VaultSnapshot } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import type { TFunc } from "../lib/i18n";
import { isIMEComposing } from "../lib/ime";
import { cn } from "../lib/cn";
import {
  buildAppCommands,
  buildFileEntries,
  filterCommands,
  mapSearchHits,
  rankFiles,
  type AppCommand,
  type CommandDeps,
  type MainViewId,
  type RankedFile,
  type SearchHitView,
} from "../lib/commands";

export type MainView = MainViewId;

export type PaletteMode = "commands" | "files" | "search";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  snapshot: VaultSnapshot | null;
  /** vault 相对路径(含 canvas/sheet) */
  entryPaths?: string[];
  recentPaths?: string[];
  actions: VaultActions;
  onNewNote: () => void;
  onNewCanvas: () => void;
  onNavigate: (v: MainView) => void;
  t: TFunc;
  mode?: PaletteMode;
  commandExtras?: Omit<
    CommandDeps,
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
  entryPaths = [],
  recentPaths = [],
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
  const [searchHits, setSearchHits] = useState<SearchHitView[]>([]);
  const [searching, setSearching] = useState(false);

  const allCommands: AppCommand[] = useMemo(() => {
    return buildAppCommands({
      t,
      openPicker: () => actions.openPicker(),
      onNewNote,
      onNewCanvas,
      onNavigate,
      refreshIndex: () => actions.refreshIndex(),
      ...commandExtras,
    });
  }, [t, actions, onNewNote, onNewCanvas, onNavigate, commandExtras]);

  const cmdRows =
    mode === "commands" ? filterCommands(allCommands, q) : [];

  const files = useMemo(() => {
    const nodes = snapshot?.nodes ?? [];
    return buildFileEntries(
      nodes.map((n) => ({ path: n.path, title: n.title })),
      entryPaths,
    );
  }, [snapshot, entryPaths]);

  const fileRows: RankedFile[] = useMemo(() => {
    if (mode === "search") return [];
    // commands 模式:query 非空才附带文件;files 模式始终列表
    if (mode === "commands" && !q.trim()) return [];
    return rankFiles(files, q, recentPaths, mode === "files" ? 50 : 20);
  }, [mode, files, q, recentPaths]);

  const inputRef = useRef<HTMLInputElement>(null);
  // 打开/切模式时把焦点**强制**锁到输入框。命令面板是模态:背景的列表过滤框
  // (caret)、编辑器(.cm-focused)、工具栏按钮(button focus ring)必须彻底失焦。
  // Radix 默认 autoFocus 在 Portal 复用/竞态下不可靠,用 ref + rAF 兜底,确保
  // 焦点唯一地落在输入框 —— 焦点一旦在此,背景任何 :focus 视觉必然消失。
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, mode]);

  // 库内全文
  useEffect(() => {
    if (!open || mode !== "search") {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    const root = snapshot?.root ?? null;
    const query = q.trim();
    if (!root || !query) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      void ipc
        .searchNotes(root, query)
        .then((hits) => {
          const nodes = (snapshot?.nodes ?? []) as NodeOut[];
          setSearchHits(mapSearchHits(hits, nodes));
        })
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, mode, q, snapshot]);

  const total =
    mode === "search"
      ? searchHits.length
      : cmdRows.length + fileRows.length;

  useEffect(() => {
    setSel(0);
  }, [q, mode]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setSearchHits([]);
    }
  }, [open, mode]);

  const openFile = (path: string) => {
    actions.selectNote(path);
    onNavigate("editor");
    onOpenChange(false);
  };

  const activate = (i: number) => {
    if (mode === "search") {
      const hit = searchHits[i];
      if (hit) openFile(hit.path);
      return;
    }
    if (i < cmdRows.length) {
      cmdRows[i].run();
      onOpenChange(false);
      return;
    }
    const f = fileRows[i - cmdRows.length];
    if (f) openFile(f.path);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(total, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + total) % Math.max(total, 1));
    } else if (e.key === "Enter" && !isIMEComposing(e)) {
      e.preventDefault();
      if (total > 0) activate(sel);
    }
  };

  const title =
    mode === "search"
      ? t("palette.searchTitle")
      : mode === "files"
        ? t("palette.quickOpenTitle")
        : t("palette.title");

  const placeholder =
    mode === "search"
      ? t("palette.searchPlaceholder")
      : mode === "files"
        ? t("palette.quickOpenPlaceholder")
        : t("palette.placeholder");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-[20%] z-[100] w-[560px] max-w-[90vw] -translate-x-1/2 rounded-lg border border-surface2 bg-mantle shadow-2xl outline-none"
          data-testid="command-palette"
          data-palette-mode={mode}
          onOpenAutoFocus={(e) => {
            // 接管 Radix 默认聚焦:显式锁到输入框,避免焦点落在 Content 容器
            // 或被背景元素夺回。
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            data-testid="palette-input"
            className="w-full border-b border-crust bg-transparent px-3 py-2.5 text-[14px] text-text outline-none placeholder:text-overlay"
          />
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {mode === "commands" && cmdRows.length > 0 && q.trim() && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-overlay">
                {t("palette.section.commands")}
              </div>
            )}
            {cmdRows.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  data-testid={`palette-cmd-${a.id}`}
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

            {fileRows.length > 0 && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-overlay">
                {t("palette.section.notes")}
              </div>
            )}
            {fileRows.map((n, j) => {
              const i = cmdRows.length + j;
              const Icon =
                n.kind === "canvas"
                  ? Rectangle
                  : n.kind === "sheet"
                    ? Table
                    : FileText;
              return (
                <button
                  key={n.path}
                  type="button"
                  data-testid={`palette-file-${n.path}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => activate(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px]",
                    sel === i ? "bg-surface text-text" : "text-subtext",
                  )}
                >
                  <Icon size={14} className="text-blue" />
                  <span className="truncate">{n.title}</span>
                  <span className="ml-auto truncate text-[11px] text-overlay">
                    {n.path}
                  </span>
                </button>
              );
            })}

            {mode === "search" && (
              <>
                {(searchHits.length > 0 || searching) && (
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-overlay">
                    {t("palette.section.search")}
                  </div>
                )}
                {searching && (
                  <p className="px-3 py-2 text-[12px] text-overlay">
                    {t("palette.searchHint")}
                  </p>
                )}
                {searchHits.map((h, i) => (
                  <button
                    key={`${h.id}-${h.path}`}
                    type="button"
                    data-testid={`palette-search-${h.path}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => activate(i)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded px-2.5 py-1.5 text-left",
                      sel === i ? "bg-surface text-text" : "text-subtext",
                    )}
                  >
                    <div className="flex items-center gap-2 text-[13px]">
                      <MagnifyingGlass size={14} className="text-blue" />
                      <span className="truncate font-medium">{h.title}</span>
                      <span className="ml-auto truncate text-[11px] text-overlay">
                        {h.path}
                      </span>
                    </div>
                    {h.preview && (
                      <span className="line-clamp-1 pl-6 text-[11px] text-overlay">
                        {h.preview}
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}

            {total === 0 && !searching && (
              <p className="px-3 py-3 text-[12px] text-overlay">
                {mode === "search" && q.trim()
                  ? t("palette.searchEmpty")
                  : t("palette.empty")}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
