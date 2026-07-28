/**
 * useLocale —— 界面语言状态与持久化(F-L10N)。
 *
 * 与 useTheme 同构:初次从 localStorage 读偏好(无则默认 zh);暴露 `t(key, vars)`
 * 绑定当前语言,以及 `toggle` / `setLocale`。`t` 经 useCallback 依赖 locale,
 * 语言切换后所有用到的组件自动重渲染为新文案。
 */
import { useCallback, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
} from "./i18n";

function readInitial(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    // 无痕模式等场景下静默忽略。
  }
  return DEFAULT_LOCALE;
}

export interface LocaleApi {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggle: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function useLocale(): LocaleApi {
  const [locale, setLocaleState] = useState<Locale>(readInitial);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      // 持久化失败静默。
    }
  }, []);

  const toggle = useCallback(
    () => setLocale(locale === "zh" ? "en" : "zh"),
    [locale, setLocale],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  return { locale, setLocale, toggle, t };
}
