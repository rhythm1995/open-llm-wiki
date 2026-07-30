/**
 * settings —— 应用偏好聚合(纯逻辑,无 DOM)。
 *
 * 键复用既有 localStorage:`openobs.theme` / locale / editMode /
 * attachmentsDir / editorLayout。Settings 面板与各 hook 读写同一套键。
 */
import type { EditMode } from "./edit-mode";
import { normalizeEditMode, EDIT_MODE_KEY } from "./edit-mode";
import type { Locale } from "./i18n";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./i18n";
import type { Theme } from "./theme";
import { THEME_STORAGE_KEY, resolveTheme } from "./theme";
import {
  ATTACHMENTS_DIR_KEY,
  DEFAULT_ATTACHMENTS_DIR,
  EDITOR_LAYOUT_KEY,
  normalizeAttachmentsDir,
  normalizeEditorLayout,
  type EditorLayoutMode,
} from "./attachments";

export interface AppSettings {
  theme: Theme;
  locale: Locale;
  /** 默认编辑模式(新开会话/迁移后用户偏好)。 */
  defaultEditMode: EditMode;
  /** vault 内附件子目录(相对根,默认 attachments)。 */
  attachmentsDir: string;
  /** source 下编辑布局:纯编辑 / 并排阅读。 */
  editorLayout: EditorLayoutMode;
}

export type StorageGet = (key: string) => string | null;
export type StorageSet = (key: string, value: string) => void;

export function defaultAppSettings(): AppSettings {
  return {
    theme: "light",
    locale: DEFAULT_LOCALE,
    defaultEditMode: "wysiwyg",
    attachmentsDir: DEFAULT_ATTACHMENTS_DIR,
    editorLayout: "edit",
  };
}

/** 从存储读取完整设置(缺省回退 defaultAppSettings)。 */
export function loadAppSettings(
  getItem: StorageGet,
  systemDark = false,
): AppSettings {
  const themeRaw = getItem(THEME_STORAGE_KEY);
  const theme = resolveTheme(
    themeRaw as Theme | "system" | null,
    systemDark,
  );
  const locRaw = getItem(LOCALE_STORAGE_KEY);
  const locale: Locale =
    locRaw === "en" || locRaw === "zh" ? locRaw : DEFAULT_LOCALE;
  const editRaw = getItem(EDIT_MODE_KEY);
  // 无键 → 产品默认 wysiwyg;有键再 normalize。
  const defaultEditMode =
    editRaw == null || editRaw === ""
      ? "wysiwyg"
      : normalizeEditMode(
          editRaw === "source" || editRaw === "wysiwyg"
            ? editRaw
            : (() => {
                try {
                  return JSON.parse(editRaw) as unknown;
                } catch {
                  return editRaw;
                }
              })(),
        );
  const attachmentsDir = normalizeAttachmentsDir(getItem(ATTACHMENTS_DIR_KEY));
  // editorLayout 可能以 JSON 字符串存(usePersistentState)或以裸字符串存。
  const layoutRaw = getItem(EDITOR_LAYOUT_KEY);
  let layoutParsed: string | null = layoutRaw;
  if (layoutRaw != null) {
    try {
      const j = JSON.parse(layoutRaw) as unknown;
      if (typeof j === "string") layoutParsed = j;
    } catch {
      // 裸字符串
    }
  }
  const editorLayout = normalizeEditorLayout(layoutParsed);
  return { theme, locale, defaultEditMode, attachmentsDir, editorLayout };
}

/** 写入完整或部分设置。 */
export function saveAppSettings(
  patch: Partial<AppSettings>,
  setItem: StorageSet,
): void {
  if (patch.theme != null) setItem(THEME_STORAGE_KEY, patch.theme);
  if (patch.locale != null) setItem(LOCALE_STORAGE_KEY, patch.locale);
  if (patch.defaultEditMode != null) {
    setItem(EDIT_MODE_KEY, patch.defaultEditMode);
  }
  if (patch.attachmentsDir != null) {
    setItem(
      ATTACHMENTS_DIR_KEY,
      normalizeAttachmentsDir(patch.attachmentsDir),
    );
  }
  if (patch.editorLayout != null) {
    setItem(EDITOR_LAYOUT_KEY, patch.editorLayout);
  }
}

/** 合并 patch 到当前 settings(不可变)。 */
export function mergeAppSettings(
  current: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  return { ...current, ...patch };
}
