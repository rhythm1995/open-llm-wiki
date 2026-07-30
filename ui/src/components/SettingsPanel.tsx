/**
 * SettingsPanel —— 应用偏好(主题/语言/默认编辑模式/附件目录/并排布局)。
 * 落盘键与 useTheme / useLocale / editMode / attachments 共用。
 */
import type { EditMode } from "../lib/edit-mode";
import type { Locale } from "../lib/i18n";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";
import type { AppSettings } from "../lib/settings";
import type { EditorLayoutMode } from "../lib/attachments";
import { X } from "@phosphor-icons/react";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  t: TFunc;
}

export function SettingsPanel({ open, onClose, settings, onChange, t }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      data-testid="settings-panel"
      onClick={onClose}
    >
      <div
        className="w-[min(420px,92vw)] rounded-lg border border-crust bg-mantle p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-text">
            {t("settings.title")}
          </h2>
          <button
            type="button"
            className="rounded p-1 text-overlay hover:bg-surface hover:text-text"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block text-[12px] text-subtext">
          <span className="mb-1 block text-overlay">{t("settings.theme")}</span>
          <select
            className="w-full rounded border border-crust bg-base px-2 py-1.5 text-text"
            value={settings.theme}
            onChange={(e) => onChange({ theme: e.target.value as Theme })}
          >
            <option value="light">{t("settings.theme.light")}</option>
            <option value="dark">{t("settings.theme.dark")}</option>
          </select>
        </label>

        <label className="mb-3 block text-[12px] text-subtext">
          <span className="mb-1 block text-overlay">{t("settings.locale")}</span>
          <select
            className="w-full rounded border border-crust bg-base px-2 py-1.5 text-text"
            value={settings.locale}
            onChange={(e) => onChange({ locale: e.target.value as Locale })}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="mb-3 block text-[12px] text-subtext">
          <span className="mb-1 block text-overlay">
            {t("settings.defaultEditMode")}
          </span>
          <select
            className="w-full rounded border border-crust bg-base px-2 py-1.5 text-text"
            value={settings.defaultEditMode}
            onChange={(e) =>
              onChange({ defaultEditMode: e.target.value as EditMode })
            }
          >
            <option value="wysiwyg">{t("settings.mode.wysiwyg")}</option>
            <option value="source">{t("settings.mode.source")}</option>
          </select>
        </label>
        <p className="mb-3 text-[11px] text-overlay">
          {t("settings.defaultEditModeHint")}
        </p>

        <label className="mb-3 block text-[12px] text-subtext">
          <span className="mb-1 block text-overlay">
            {t("settings.attachmentsDir")}
          </span>
          <input
            type="text"
            className="w-full rounded border border-crust bg-base px-2 py-1.5 font-mono text-text"
            value={settings.attachmentsDir}
            data-testid="settings-attachments-dir"
            onChange={(e) => onChange({ attachmentsDir: e.target.value })}
            spellCheck={false}
          />
        </label>
        <p className="mb-3 text-[11px] text-overlay">
          {t("settings.attachmentsDirHint")}
        </p>

        <label className="mb-2 block text-[12px] text-subtext">
          <span className="mb-1 block text-overlay">
            {t("settings.editorLayout")}
          </span>
          <select
            className="w-full rounded border border-crust bg-base px-2 py-1.5 text-text"
            value={settings.editorLayout}
            data-testid="settings-editor-layout"
            onChange={(e) =>
              onChange({
                editorLayout: e.target.value as EditorLayoutMode,
              })
            }
          >
            <option value="edit">{t("settings.layout.edit")}</option>
            <option value="split">{t("settings.layout.split")}</option>
          </select>
        </label>
        <p className="text-[11px] text-overlay">{t("settings.editorLayoutHint")}</p>
      </div>
    </div>
  );
}
