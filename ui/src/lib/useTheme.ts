/**
 * useTheme —— 主题状态与持久化。
 *
 * 初次挂载从 localStorage 读偏好(无则产品默认深色),并把 `data-theme` 写到
 * <html>,供 index.css 的 `[data-theme="light"]` 覆盖切换。toggle 翻转并落盘。
 */
import { useCallback, useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  resolveTheme,
  toggleTheme,
  type Theme,
} from "./theme";

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const sysDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveTheme(stored as Theme | "system" | null, sysDark);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = toggleTheme(t);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // 无痕模式等场景下静默忽略。
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
