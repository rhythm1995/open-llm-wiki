/**
 * SettingsPanel —— 应用偏好(主题/语言/默认编辑模式/附件目录/并排布局/诊断日志)。
 * 落盘键与 useTheme / useLocale / editMode / attachments 共用。
 */
import { useEffect, useState } from "react";
import type { EditMode } from "../lib/edit-mode";
import type { Locale } from "../lib/i18n";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";
import type { AppSettings } from "../lib/settings";
import type { EditorLayoutMode } from "../lib/attachments";
import {
  getLogStatus,
  openLogDir,
  setLogProfile,
  type LogProfile,
  type LogStatus,
} from "../lib/logger";
import { X } from "@phosphor-icons/react";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  t: TFunc;
}

export function SettingsPanel({ open, onClose, settings, onChange, t }: Props) {
  const [logStatus, setLogStatus] = useState<LogStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    void getLogStatus().then(setLogStatus);
  }, [open]);

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

        <div className="mt-4 border-t border-crust pt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
            {t("settings.graphForces")}
          </div>
          <p className="mb-2 text-[11px] text-overlay">
            {t("settings.graphForcesHint")}
          </p>
          <ForceSlider
            label={t("settings.force.center")}
            value={settings.graphForces.center}
            onChange={(v) =>
              onChange({
                graphForces: { ...settings.graphForces, center: v },
              })
            }
          />
          <ForceSlider
            label={t("settings.force.repel")}
            value={settings.graphForces.repel}
            onChange={(v) =>
              onChange({
                graphForces: { ...settings.graphForces, repel: v },
              })
            }
          />
          <ForceSlider
            label={t("settings.force.linkStrength")}
            value={settings.graphForces.linkStrength}
            onChange={(v) =>
              onChange({
                graphForces: { ...settings.graphForces, linkStrength: v },
              })
            }
          />
          <ForceSlider
            label={t("settings.force.linkDistance")}
            value={settings.graphForces.linkDistance}
            onChange={(v) =>
              onChange({
                graphForces: { ...settings.graphForces, linkDistance: v },
              })
            }
          />
          <button
            type="button"
            className="mt-1 w-full rounded border border-crust bg-base px-2 py-1 text-[11px] text-overlay hover:bg-surface"
            onClick={() => onChange({ graphForces: { center: 1, repel: 1, linkStrength: 1, linkDistance: 1 } })}
          >
            {t("settings.force.reset")}
          </button>
        </div>

        <div className="mt-4 border-t border-crust pt-3" data-testid="settings-diagnostics">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
            {t("settings.diagnostics")}
          </div>
          <p className="mb-2 text-[11px] text-overlay">
            {t("settings.diagnosticsHint")}
          </p>
          {logStatus ? (
            <>
              <p className="mb-1 break-all font-mono text-[11px] text-subtext">
                {logStatus.dir || "—"}
              </p>
              <p className="mb-2 text-[11px] text-overlay">
                {t("settings.logProfile")}: {logStatus.profile}
                {logStatus.sessionId
                  ? ` · session ${logStatus.sessionId}`
                  : ""}
              </p>
              <label className="mb-2 block text-[12px] text-subtext">
                <span className="mb-1 block text-overlay">
                  {t("settings.logProfile")}
                </span>
                <select
                  className="w-full rounded border border-crust bg-base px-2 py-1.5 text-text"
                  value={
                    logStatus.profile === "verbose" ||
                    logStatus.profile === "prod" ||
                    logStatus.profile === "dev"
                      ? logStatus.profile
                      : "dev"
                  }
                  data-testid="settings-log-profile"
                  onChange={(e) => {
                    const p = e.target.value as LogProfile;
                    void setLogProfile(p).then((next) => {
                      if (next) {
                        setLogStatus((s) =>
                          s ? { ...s, profile: next } : s,
                        );
                      }
                    });
                  }}
                >
                  <option value="dev">{t("settings.logProfile.dev")}</option>
                  <option value="verbose">
                    {t("settings.logProfile.verbose")}
                  </option>
                  <option value="prod">{t("settings.logProfile.prod")}</option>
                </select>
              </label>
              <button
                type="button"
                className="w-full rounded border border-crust bg-base px-2 py-1.5 text-[12px] text-text hover:bg-surface"
                data-testid="settings-open-log-dir"
                onClick={() => void openLogDir()}
              >
                {t("settings.openLogDir")}
              </button>
            </>
          ) : (
            <p className="text-[11px] text-overlay">
              {t("settings.diagnosticsMock")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 力参数滑条:0–3,步进 0.1,默认 1。 */
function ForceSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-1.5 flex items-center gap-2 text-[12px] text-subtext">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={3}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--color-blue)]"
        aria-label={label}
      />
      <span className="w-8 text-right tabular-nums text-overlay">
        {value.toFixed(1)}
      </span>
    </label>
  );
}
