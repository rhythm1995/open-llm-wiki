import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  resolveTheme,
  toggleTheme,
  type ThemePref,
} from "./theme";

describe("theme logic", () => {
  describe("resolveTheme", () => {
    it("显式 light/dark 原样返回", () => {
      expect(resolveTheme("light", true)).toBe("light");
      expect(resolveTheme("dark", false)).toBe("dark");
    });
    it("system 跟随系统偏好", () => {
      expect(resolveTheme("system", true)).toBe("dark");
      expect(resolveTheme("system", false)).toBe("light");
    });
    it("无偏好(null)回退到产品默认:浅色", () => {
      expect(resolveTheme(null, true)).toBe("light");
      expect(resolveTheme(null, false)).toBe("light");
    });
    it("未知偏好也安全回退到浅色", () => {
      expect(resolveTheme("whatever" as ThemePref, false)).toBe("light");
    });
  });

  describe("toggleTheme", () => {
    it("深 ↔ 浅 翻转", () => {
      expect(toggleTheme("dark")).toBe("light");
      expect(toggleTheme("light")).toBe("dark");
    });
  });

  describe("THEME_STORAGE_KEY", () => {
    it("是稳定的存储键名", () => {
      expect(THEME_STORAGE_KEY).toBe("open-llm-wiki.theme");
    });
  });
});
