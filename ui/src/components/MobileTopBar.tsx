/**
 * MobileTopBar —— 移动壳顶栏(doc 18 M1)。
 *
 * 菜单键(开抽屉)+ 标题 + 搜索 + 新建。pt-[env(safe-area-inset-top)] 适配刘海屏。
 */
import { List, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";

export function MobileTopBar({
  title,
  onOpenDrawer,
  onOpenSearch,
  onNewNote,
  t,
}: {
  title: string;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onNewNote: () => void;
  t: TFunc;
}) {
  return (
    <header
      data-testid="mobile-topbar"
      className="flex shrink-0 items-center gap-0.5 border-b border-crust bg-mantle px-1.5 pt-[env(safe-area-inset-top)]"
    >
      <button
        type="button"
        data-testid="mobile-drawer-open"
        aria-label={t("mobile.drawer.open")}
        title={t("mobile.drawer.open")}
        onClick={onOpenDrawer}
        className="rounded p-2 text-subtext hover:bg-surface2"
      >
        <List size={20} />
      </button>
      <h1 className="min-w-0 flex-1 truncate px-1 text-[14px] font-medium text-text">
        {title}
      </h1>
      <button
        type="button"
        data-testid="mobile-search"
        aria-label={t("mobile.search")}
        title={t("mobile.search")}
        onClick={onOpenSearch}
        className="rounded p-2 text-subtext hover:bg-surface2"
      >
        <MagnifyingGlass size={20} />
      </button>
      <button
        type="button"
        data-testid="mobile-new-note"
        aria-label={t("mobile.newNote")}
        title={t("mobile.newNote")}
        onClick={onNewNote}
        className="rounded p-2 text-subtext hover:bg-surface2"
      >
        <Plus size={20} />
      </button>
    </header>
  );
}
