import { describe, expect, it } from "vitest";
import {
  MOBILE_BREAKPOINT_PX,
  resolveMobileLayout,
} from "./platform";

describe("resolveMobileLayout (doc 18 M1)", () => {
  it("iOS 恒为移动壳(视口再宽也不切桌面三栏)", () => {
    expect(resolveMobileLayout("ios", 390)).toBe(true);
    expect(resolveMobileLayout("ios", 1366)).toBe(true);
  });

  it("桌面 Tauri 恒桌面壳(窗口再窄也不切,保三栏行为)", () => {
    expect(resolveMobileLayout("desktop", 1400)).toBe(false);
    expect(resolveMobileLayout("desktop", 390)).toBe(false);
  });

  it("浏览器 mock 按断点切(窄视口预览移动壳,e2e 同路径)", () => {
    expect(resolveMobileLayout("browser", MOBILE_BREAKPOINT_PX)).toBe(true);
    expect(resolveMobileLayout("browser", MOBILE_BREAKPOINT_PX + 1)).toBe(false);
  });
});
