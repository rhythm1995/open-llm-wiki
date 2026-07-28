/**
 * Toolbar —— 顶栏:视图切换 + 命令面板入口 + 手动保存 + 主题/语言切换。
 */
import {
  PencilSimple,
  Graph,
  ListMagnifyingGlass,
  MagnifyingGlass,
  Trash,
  GitBranch,
  Command,
  FloppyDisk,
  Sun,
  Moon,
  Globe,
} from "@phosphor-icons/react";
import type { MainView } from "./CommandPalette";
import type { VaultActions } from "../lib/store";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { cn } from "../lib/cn";

interface Props {
  view: MainView;
  onNavigate: (v: MainView) => void;
  onOpenPalette: () => void;
  actions: VaultActions;
  theme: Theme;
  onToggleTheme: () => void;
  locale: Locale;
  onToggleLocale: () => void;
  t: TFunc;
}

const VIEWS: { id: MainView; key: string; icon: typeof PencilSimple }[] = [
  { id: "editor", key: "view.editor", icon: PencilSimple },
  { id: "graph", key: "view.graph", icon: Graph },
  { id: "query", key: "view.query", icon: ListMagnifyingGlass },
  { id: "search", key: "view.search", icon: MagnifyingGlass },
  { id: "trash", key: "view.trash", icon: Trash },
  { id: "git", key: "view.git", icon: GitBranch },
];

export function Toolbar({
  view,
  onNavigate,
  onOpenPalette,
  actions,
  theme,
  onToggleTheme,
  locale,
  onToggleLocale,
  t,
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
              {t(v.key)}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleLocale}
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-subtext hover:bg-surface"
          title={locale === "zh" ? t("toolbar.locale.toEn") : t("toolbar.locale.toZh")}
        >
          <Globe size={14} />
          <span className="text-[11px]">{locale === "zh" ? "EN" : "中"}</span>
        </button>
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-subtext hover:bg-surface"
          title={theme === "dark" ? t("toolbar.theme.light") : t("toolbar.theme.dark")}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => actions.saveNow()}
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-subtext hover:bg-surface"
          title={t("toolbar.save")}
        >
          <FloppyDisk size={14} />
        </button>
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-1 rounded border border-surface px-2 py-1 text-[12px] text-overlay hover:bg-surface"
          title={t("toolbar.palette")}
        >
          <Command size={13} />
          <span className="hidden sm:inline">⌘K</span>
        </button>
      </div>
    </div>
  );
}
