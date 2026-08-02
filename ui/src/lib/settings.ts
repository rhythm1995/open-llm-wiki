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
  ATTACHMENT_LAYOUT_KEY,
  ATTACHMENTS_DIR_KEY,
  DEFAULT_ATTACHMENT_LAYOUT,
  DEFAULT_ATTACHMENTS_DIR,
  EDITOR_LAYOUT_KEY,
  normalizeAttachmentLayout,
  normalizeAttachmentsDir,
  normalizeEditorLayout,
  type AttachmentLayout,
  type EditorLayoutMode,
} from "./attachments";
import { DEFAULT_FORCES, normalizeForces, type ForceParams } from "./graph-layout";

/** 图谱力参数存储键(6A2)。存 JSON。 */
export const GRAPH_FORCES_KEY = "openobs.graph.forces";

export interface AppSettings {
  theme: Theme;
  locale: Locale;
  /** 默认编辑模式(新开会话/迁移后用户偏好)。 */
  defaultEditMode: EditMode;
  /** vault 内附件子目录(相对根,默认 attachments)。 */
  attachmentsDir: string;
  /**
   * 附件落盘布局:folder / folder-date / folder-note(默认) / note-folder。
   * 见 attachments.ts AttachmentLayout。
   */
  attachmentLayout: AttachmentLayout;
  /** source 下编辑布局:纯编辑 / 并排阅读。 */
  editorLayout: EditorLayoutMode;
  /** 图谱力导向参数(6A2):中心引力 / 斥力 / 弹簧强度 / 弹簧长度。 */
  graphForces: ForceParams;
}

export type StorageGet = (key: string) => string | null;
export type StorageSet = (key: string, value: string) => void;

export function defaultAppSettings(): AppSettings {
  return {
    theme: "light",
    locale: DEFAULT_LOCALE,
    defaultEditMode: "wysiwyg",
    attachmentsDir: DEFAULT_ATTACHMENTS_DIR,
    attachmentLayout: DEFAULT_ATTACHMENT_LAYOUT,
    editorLayout: "edit",
    graphForces: DEFAULT_FORCES,
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
  const attachmentLayout = normalizeAttachmentLayout(
    getItem(ATTACHMENT_LAYOUT_KEY),
  );
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
  // graphForces(6A2):存 JSON;非对象 / 缺字段 / NaN 一律被 normalizeForces 兜底。
  let forcesParsed: unknown = null;
  const forcesRaw = getItem(GRAPH_FORCES_KEY);
  if (forcesRaw) {
    try {
      forcesParsed = JSON.parse(forcesRaw);
    } catch {
      forcesParsed = null;
    }
  }
  const graphForces = normalizeForces(forcesParsed as Partial<ForceParams> | null);
  return {
    theme,
    locale,
    defaultEditMode,
    attachmentsDir,
    attachmentLayout,
    editorLayout,
    graphForces,
  };
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
  if (patch.attachmentLayout != null) {
    setItem(
      ATTACHMENT_LAYOUT_KEY,
      normalizeAttachmentLayout(patch.attachmentLayout),
    );
  }
  if (patch.editorLayout != null) {
    setItem(EDITOR_LAYOUT_KEY, patch.editorLayout);
  }
  if (patch.graphForces != null) {
    setItem(GRAPH_FORCES_KEY, JSON.stringify(normalizeForces(patch.graphForces)));
  }
}

/** mergeAppSettings 的 patch:graphForces 允许部分(单滑块深合并),其余字段可选。 */
export type AppSettingsPatch = Partial<Omit<AppSettings, "graphForces">> & {
  graphForces?: Partial<ForceParams>;
};

/** 合并 patch 到当前 settings(不可变)。graphForces 支持单字段深合并。 */
export function mergeAppSettings(
  current: AppSettings,
  patch: AppSettingsPatch,
): AppSettings {
  const { graphForces: gfPatch, ...rest } = patch;
  const graphForces = gfPatch
    ? normalizeForces({ ...current.graphForces, ...gfPatch })
    : current.graphForces;
  return { ...current, ...rest, graphForces };
}
