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
import {
  ATTACHMENT_LAYOUT_KEY,
  ATTACHMENTS_DIR_KEY,
  EDITOR_LAYOUT_KEY,
} from "./attachments";
import { DEFAULT_FORCES } from "./graph-layout";
import { GRAPH_FORCES_KEY } from "./settings";

describe("loadAppSettings / saveAppSettings", () => {
  it("空存储 → 默认", () => {
    expect(loadAppSettings(() => null)).toEqual(defaultAppSettings());
  });

  it("读取已存键", () => {
    const map: Record<string, string> = {
      [THEME_STORAGE_KEY]: "dark",
      [LOCALE_STORAGE_KEY]: "en",
      [EDIT_MODE_KEY]: "source",
      [ATTACHMENTS_DIR_KEY]: "assets/img",
      [ATTACHMENT_LAYOUT_KEY]: "folder-date",
      [EDITOR_LAYOUT_KEY]: "split",
    };
    expect(loadAppSettings((k) => map[k] ?? null)).toEqual({
      theme: "dark",
      locale: "en",
      defaultEditMode: "source",
      attachmentsDir: "assets/img",
      attachmentLayout: "folder-date",
      editorLayout: "split",
      graphForces: DEFAULT_FORCES, // 无 graph 键 → 默认
    });
  });

  it("读取 graphForces(部分字段,缺失被兜底)", () => {
    const map: Record<string, string> = {
      [GRAPH_FORCES_KEY]: JSON.stringify({ repel: 2.5, junk: "x" }),
    };
    const s = loadAppSettings((k) => map[k] ?? null);
    expect(s.graphForces).toEqual({
      center: 1,
      repel: 2.5,
      linkStrength: 1,
      linkDistance: 1,
    });
  });

  it("graphForces 非 JSON / 非对象 → 默认", () => {
    const map: Record<string, string> = { [GRAPH_FORCES_KEY]: "not-json" };
    expect(loadAppSettings((k) => map[k] ?? null).graphForces).toEqual(DEFAULT_FORCES);
    const map2: Record<string, string> = { [GRAPH_FORCES_KEY]: "[1,2,3]" };
    expect(loadAppSettings((k) => map2[k] ?? null).graphForces).toEqual(DEFAULT_FORCES);
  });

  it("mergeAppSettings 单字段深合并 graphForces", () => {
    const base = defaultAppSettings();
    const merged = mergeAppSettings(base, { graphForces: { repel: 3 } });
    expect(merged.graphForces.repel).toBe(3);
    expect(merged.graphForces.center).toBe(1); // 其余保留
    expect(base.graphForces.repel).toBe(1); // 不改入参
  });

  it("save 写回存储", () => {
    const map: Record<string, string> = {};
    saveAppSettings(
      {
        theme: "dark",
        locale: "en",
        defaultEditMode: "source",
        attachmentsDir: "media",
        attachmentLayout: "note-folder",
        editorLayout: "split",
      },
      (k, v) => {
        map[k] = v;
      },
    );
    expect(map[THEME_STORAGE_KEY]).toBe("dark");
    expect(map[LOCALE_STORAGE_KEY]).toBe("en");
    expect(map[EDIT_MODE_KEY]).toBe("source");
    expect(map[ATTACHMENTS_DIR_KEY]).toBe("media");
    expect(map[ATTACHMENT_LAYOUT_KEY]).toBe("note-folder");
    expect(map[EDITOR_LAYOUT_KEY]).toBe("split");
  });

  it("merge 部分 patch", () => {
    const base = defaultAppSettings();
    expect(mergeAppSettings(base, { locale: "en" }).locale).toBe("en");
    expect(mergeAppSettings(base, { locale: "en" }).theme).toBe("light");
  });
});
