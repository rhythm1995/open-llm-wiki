import { describe, expect, it } from "vitest";
import {
  defaultAppSettings,
  loadAppSettings,
  mergeAppSettings,
  saveAppSettings,
} from "./settings";
import { EDIT_MODE_KEY } from "./edit-mode";
import { LOCALE_STORAGE_KEY } from "./i18n";
import { THEME_STORAGE_KEY } from "./theme";

describe("loadAppSettings / saveAppSettings", () => {
  it("空存储 → 默认", () => {
    expect(loadAppSettings(() => null)).toEqual(defaultAppSettings());
  });

  it("读取已存键", () => {
    const map: Record<string, string> = {
      [THEME_STORAGE_KEY]: "dark",
      [LOCALE_STORAGE_KEY]: "en",
      [EDIT_MODE_KEY]: "source",
    };
    expect(loadAppSettings((k) => map[k] ?? null)).toEqual({
      theme: "dark",
      locale: "en",
      defaultEditMode: "source",
    });
  });

  it("save 写回存储", () => {
    const map: Record<string, string> = {};
    saveAppSettings(
      { theme: "dark", locale: "en", defaultEditMode: "source" },
      (k, v) => {
        map[k] = v;
      },
    );
    expect(map[THEME_STORAGE_KEY]).toBe("dark");
    expect(map[LOCALE_STORAGE_KEY]).toBe("en");
    expect(map[EDIT_MODE_KEY]).toBe("source");
  });

  it("merge 部分 patch", () => {
    const base = defaultAppSettings();
    expect(mergeAppSettings(base, { locale: "en" }).locale).toBe("en");
    expect(mergeAppSettings(base, { locale: "en" }).theme).toBe("light");
  });
});
