/**
 * F-THEMES 主题的纯逻辑(无 DOM、无 IO)。
 *
 * 明/暗两套(Catppuccin Mocha 深、Latte 浅),深色为产品默认。偏好可显式
 * light/dark,或 system 跟随系统;无偏好时回退到深色(深色优先)。
 * 实际落盘(localStorage)与 DOM 属性由 useTheme hook 完成。
 */
export type Theme = "light" | "dark";
export type ThemePref = Theme | "system";

export const THEME_STORAGE_KEY = "openobs.theme";

/** 把偏好解析成实际主题:显式优先;system 跟随系统;null/未知 → 深色(产品默认)。 */
export function resolveTheme(pref: ThemePref | null, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  if (pref === "system") return systemDark ? "dark" : "light";
  return "dark";
}

/** 在明暗之间翻转。 */
export function toggleTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}
