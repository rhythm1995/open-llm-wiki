/**
 * Toolbar —— 顶栏:视图切换 + 命令面板入口 + 手动保存。
 */
import {
  PencilSimple,
  Graph,
  ListMagnifyingGlass,
  MagnifyingGlass,
  Trash,
  Command,
  FloppyDisk,
  Sun,
  Moon,
} from "@phosphor-icons/react";
import type { MainView } from "./CommandPalette";
import type { VaultActions } from "../lib/store";
import type { Theme } from "../lib/theme";
import { cn } from "../lib/cn";

interface Props {
  view: MainView;
  onNavigate: (v: MainView) => void;
  onOpenPalette: () => void;
  actions: VaultActions;
  theme: Theme;
  onToggleTheme: () => void;
}

const VIEWS: { id: MainView; label: string; icon: typeof PencilSimple }[] = [
  { id: "editor", label: "编辑器", icon: PencilSimple },
  { id: "graph", label: "图谱", icon: Graph },
  { id: "query", label: "查询", icon: ListMagnifyingGlass },
  { id: "search", label: "搜索", icon: MagnifyingGlass },
  { id: "trash", label: "回收站", icon: Trash },
];

export function Toolbar({
  view,
  onNavigate,
  onOpenPalette,
  actions,
  theme,
  onToggleTheme,
}: Props) {
  return (
    <div className="flex items-center gap-1 border-b border-crust bg-base px-2 py-1">
      <div className="flex items-center gap-0.5">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onNavigate(v.id)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px]",
                active
                  ? "bg-surface text-text"
                  : "text-subtext hover:bg-surface",
              )}
            >
              <Icon size={14} weight={active ? "fill" : "regular"} />
              {v.label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-subtext hover:bg-surface"
          title={theme === "dark" ? "切换到浅色" : "切换到深色"}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => actions.saveNow()}
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-subtext hover:bg-surface"
          title="立即保存"
        >
          <FloppyDisk size={14} />
        </button>
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-1 rounded border border-surface px-2 py-1 text-[12px] text-overlay hover:bg-surface"
          title="命令面板 (⌘K)"
        >
          <Command size={13} />
          <span className="hidden sm:inline">⌘K</span>
        </button>
      </div>
    </div>
  );
}
