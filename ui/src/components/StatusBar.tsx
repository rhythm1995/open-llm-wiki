/**
 * StatusBar —— 底栏:保存状态 + 当前路径 + 节点计数 + mock 提示 + 主题/语言切换。
 *
 * 对齐 Tolaria:底栏收纳主题/语言切换(Tolaria 不在顶栏突出这些)。Phase B 会在此
 * 扩充 vault 名 / 版本 / Git Changes 徽标 / 最近提交(见 useGit hook,本轮未做)。
 */
import { Check, CircleNotch, Sun, Moon } from "@phosphor-icons/react";
import type { VaultState } from "../lib/store";
import type { Theme } from "../lib/theme";
import type { Locale, TFunc } from "../lib/i18n";
import { ipc } from "../lib/ipc";
import { isCanvasPath } from "../lib/canvas";
import { countText } from "../lib/text-stats";

interface Props {
  state: VaultState;
  theme: Theme;
  onToggleTheme: () => void;
  locale: Locale;
  onToggleLocale: () => void;
  t: TFunc;
}

export function StatusBar({
  state,
  theme,
  onToggleTheme,
  locale,
  onToggleLocale,
  t,
}: Props) {
  // 画布是 Excalidraw JSON,不计入文本统计(避免把 JSON 当文章字数)。
  const showStats =
    !!state.currentPath &&
    !isCanvasPath(state.currentPath) &&
    !state.currentPath.toLowerCase().endsWith(".sheet");
  const stats = showStats ? countText(state.content) : null;

  return (
    <div className="flex items-center gap-3 border-t border-crust bg-mantle px-3 py-1 text-[11px] text-overlay">
      {state.saveState === "saving" ? (
        <span className="flex items-center gap-1 text-yellow">
          <CircleNotch size={11} /> {t("status.saving")}
        </span>
      ) : state.saveState === "saved" ? (
        <span className="flex items-center gap-1 text-green">
          <Check size={11} weight="bold" /> {t("status.saved")}
        </span>
      ) : state.dirty ? (
        <span className="text-overlay">{t("status.dirty")}</span>
      ) : (
        <span>{t("status.idle")}</span>
      )}
      {state.currentPath && (
        <span className="truncate text-subtext">{state.currentPath}</span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {stats && (
          <span className="tabular-nums">
            {t("status.textStats", {
              chars: stats.chars,
              lines: stats.lines,
              words: stats.words,
            })}
          </span>
        )}
        {state.snapshot && (
          <span>{t("status.notes", { n: state.snapshot.nodes.length })}</span>
        )}
        <button
          onClick={onToggleLocale}
          title={
            locale === "zh" ? t("toolbar.locale.toEn") : t("toolbar.locale.toZh")
          }
          className="font-medium text-subtext hover:text-text"
        >
          {locale === "zh" ? "EN" : "中"}
        </button>
        <button
          onClick={onToggleTheme}
          title={
            theme === "dark" ? t("toolbar.theme.light") : t("toolbar.theme.dark")
          }
          className="flex items-center text-subtext hover:text-text"
        >
          {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        {ipc.isMock() && (
          <span className="rounded bg-surface px-1.5 py-0.5 text-yellow">
            {t("status.mock")}
          </span>
        )}
      </span>
    </div>
  );
}
