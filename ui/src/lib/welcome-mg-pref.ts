/**
 * welcome-mg-pref —— 首次理念 MG 展示位置偏好。
 *
 * - hero: 无 Vault 欢迎台中央完整动画(默认)
 * - corner: 不播中央 MG,右上角只显示品牌 logo
 */
export type WelcomeMgPlacement = "hero" | "corner";

export const WELCOME_MG_PLACEMENT_KEY = "open-llm-wiki.welcomeMgPlacement";

export function readWelcomeMgPlacement(): WelcomeMgPlacement {
  try {
    const v = localStorage.getItem(WELCOME_MG_PLACEMENT_KEY);
    return v === "corner" ? "corner" : "hero";
  } catch {
    return "hero";
  }
}

export function writeWelcomeMgPlacement(placement: WelcomeMgPlacement): void {
  try {
    localStorage.setItem(WELCOME_MG_PLACEMENT_KEY, placement);
  } catch {
    // ignore
  }
}

/** 纯逻辑:关闭对话框确认后是否写入 corner。 */
export function nextPlacementAfterClose(
  rememberCorner: boolean,
): WelcomeMgPlacement {
  return rememberCorner ? "corner" : "hero";
}
