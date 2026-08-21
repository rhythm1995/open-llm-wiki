/**
 * platform —— 运行平台判定与移动布局解析(doc 18 M1)。
 *
 * 平台三值:Tauri 后端 `app_platform` 返回 "ios" | "desktop";浏览器 mock 返回
 * "browser"(mock.ts)。移动壳判定是纯函数 `resolveMobileLayout`:
 * - iOS 恒为移动壳;
 * - 浏览器 mock 在窄视口(≤768px)也切移动壳 —— 浏览器里即可开发/测试移动布局,
 *   e2e 走同一路径;
 * - 桌面 Tauri 恒桌面壳(窗口再窄也不切,保三栏拖拽行为)。
 */
import { useEffect, useMemo, useState } from "react";
import { ipc } from "./ipc";

export type AppPlatform = "ios" | "desktop" | "browser";

/** 浏览器预览切移动壳的视口阈值(px)。 */
export const MOBILE_BREAKPOINT_PX = 768;

/** 纯逻辑:是否使用移动壳。 */
export function resolveMobileLayout(
  platform: AppPlatform,
  viewportWidth: number,
): boolean {
  if (platform === "ios") return true;
  if (platform === "browser") return viewportWidth <= MOBILE_BREAKPOINT_PX;
  return false;
}

/**
 * 平台探测:后端 getPlatform 一次,默认 "browser"(探测返回前按浏览器处理,
 * 与 mock 默认路径一致;桌面 Tauri 下 __TAURI_INTERNALS__ 同步存在,invoke 很快)。
 */
export function useAppPlatform(): AppPlatform {
  const [platform, setPlatform] = useState<AppPlatform>("browser");
  useEffect(() => {
    let cancelled = false;
    ipc
      .getPlatform()
      .then((p) => {
        if (!cancelled && (p === "ios" || p === "desktop" || p === "browser")) {
          setPlatform(p);
        }
      })
      .catch(() => {
        /* 保持默认 */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return platform;
}

/** 响应式视口宽(window resize 跟踪;SSR/无 window 时恒 1280)。 */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/** 移动壳总开关:平台 + 视口宽度 → 是否渲染移动分支。 */
export function useIsMobileLayout(): boolean {
  const platform = useAppPlatform();
  const width = useViewportWidth();
  return useMemo(
    () => resolveMobileLayout(platform, width),
    [platform, width],
  );
}
