/**
 * MobileTabBar —— 移动壳底部标签栏(doc 18 M1)。
 *
 * 三个顶级目的地:笔记 / 图谱 / 更多。底部留 env(safe-area-inset-bottom),
 * 适配全面屏手势条;顶部安全区由 MobileTopBar 负责。
 */
import { Files, GearSix, Graph } from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";

export type MobileTab = "notes" | "graph" | "more";

const TABS: { id: MobileTab; labelKey: string; Icon: typeof Files }[] = [
  { id: "notes", labelKey: "mobile.tab.notes", Icon: Files },
  { id: "graph", labelKey: "mobile.tab.graph", Icon: Graph },
  { id: "more", labelKey: "mobile.tab.more", Icon: GearSix },
];

export function MobileTabBar({
  tab,
  onSelect,
  t,
}: {
  tab: MobileTab;
  onSelect: (tab: MobileTab) => void;
  t: TFunc;
}) {
  return (
    <nav
      data-testid="mobile-tabbar"
      aria-label={t("mobile.tab.notes")}
      className="flex shrink-0 border-t border-crust bg-mantle pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ id, labelKey, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            data-testid={`mobile-tab-${id}`}
            onClick={() => onSelect(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${
              active ? "text-blue" : "text-subtext"
            }`}
          >
            <Icon size={22} weight={active ? "fill" : "regular"} />
            <span>{t(labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
