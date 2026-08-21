/**
 * MobileMore —— 移动壳「更多」标签(doc 18 M1)。
 *
 * 桌面 SettingsPanel 的移动剪裁版:主题 / 语言 / 刷新索引 / 当前 vault 与存储
 * 类别。Agent 接入、MCP、Git 等桌面专属设置不进移动端。
 */
import { ArrowsClockwise, Moon, Sun } from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";

const STORAGE_KIND_LABEL: Record<string, string> = {
  local: "Local",
  icloud: "iCloud",
  "icloud-managed": "iCloud (managed)",
  "cloud-other": "Cloud",
};

export function MobileMore({
  t,
  theme,
  onToggleTheme,
  onToggleLocale,
  onRefreshIndex,
  vaultName,
  storageKind,
}: {
  t: TFunc;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onToggleLocale: () => void;
  onRefreshIndex: () => void;
  vaultName: string | null;
  storageKind: string | null;
}) {
  return (
    <div data-testid="mobile-more" className="h-full overflow-y-auto p-3">
      {vaultName ? (
        <div className="mb-4 rounded-lg border border-crust bg-surface px-3 py-2.5">
          <p className="text-[11px] text-subtext">{t("mobile.more.vault")}</p>
          <p className="truncate text-[13px] text-text">
            {vaultName}
            {storageKind
              ? ` · ${STORAGE_KIND_LABEL[storageKind] ?? storageKind}`
              : ""}
          </p>
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-subtext">
          {t("mobile.more.noVault")}
        </p>
      )}
      <div className="divide-y divide-crust rounded-lg border border-crust bg-surface">
        <button
          type="button"
          data-testid="mobile-more-theme"
          onClick={onToggleTheme}
          className="flex w-full items-center gap-2.5 px-3 py-3 text-left text-[13px] text-text"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {t("mobile.more.theme")}
        </button>
        <button
          type="button"
          data-testid="mobile-more-locale"
          onClick={onToggleLocale}
          className="flex w-full items-center gap-2.5 px-3 py-3 text-left text-[13px] text-text"
        >
          <span className="w-[18px] text-center text-[12px] font-mono">中/EN</span>
          {t("mobile.more.locale")}
        </button>
        <button
          type="button"
          data-testid="mobile-more-refresh"
          onClick={onRefreshIndex}
          className="flex w-full items-center gap-2.5 px-3 py-3 text-left text-[13px] text-text"
        >
          <ArrowsClockwise size={18} />
          {t("mobile.more.refresh")}
        </button>
      </div>
    </div>
  );
}
