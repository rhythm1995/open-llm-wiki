/**
 * SettingsPanel —— 应用偏好,按 tab 分组(通用/图谱/Agent/诊断)。
 * 落盘键与 useTheme / useLocale / editMode / attachments 共用。
 */
import { useEffect, useState } from "react";
import type { EditMode } from "../lib/edit-mode";
import type { Locale } from "../lib/i18n";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";
import type { AppSettings } from "../lib/settings";
import type { ForceParams } from "../lib/graph-layout";
import type {
  AttachmentLayout,
  EditorLayoutMode,
} from "../lib/attachments";
import {
  exportLogBundle,
  getLogStatus,
  openLogDir,
  setLogProfile,
  type LogProfile,
  type LogStatus,
} from "../lib/logger";
import { AgentOnboardingSection } from "./AgentOnboardingSection";
import { cn } from "../lib/cn";
import { X } from "@phosphor-icons/react";

type TabId = "general" | "graph" | "agent" | "diagnostics";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  t: TFunc;
  /** 当前打开的 vault 根(「Agent 记忆接入」的默认记忆 vault)。 */
  vaultRoot?: string | null;
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  t,
  vaultRoot = null,
}: Props) {
  const [tab, setTab] = useState<TabId>("general");
  const [logStatus, setLogStatus] = useState<LogStatus | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("general");
    void getLogStatus().then(setLogStatus);
    setExportPath(null);
    setExportErr(null);
  }, [open]);

  if (!open) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "general", label: t("settings.tab.general") },
    { id: "graph", label: t("settings.tab.graph") },
    { id: "agent", label: t("settings.tab.agent") },
    { id: "diagnostics", label: t("settings.tab.diagnostics") },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      data-testid="settings-panel"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-lg border border-crust bg-mantle shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3">
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

        <div
          role="tablist"
          aria-label={t("settings.title")}
          className="mt-2 flex shrink-0 gap-1 border-b border-crust px-2"
        >
          {tabs.map((tabItem) => {
            const active = tab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                role="tab"
                id={`settings-tab-${tabItem.id}`}
                aria-selected={active}
                aria-controls={`settings-tabpanel-${tabItem.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(tabItem.id)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-[12px] font-medium transition-colors",
                  active
                    ? "border-blue text-text"
                    : "border-transparent text-overlay hover:text-text",
                )}
              >
                {tabItem.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`settings-tabpanel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          className="overflow-y-auto p-4"
        >
          {tab === "general" && (
            <GeneralTab settings={settings} onChange={onChange} t={t} />
          )}
          {tab === "graph" && (
            <GraphTab settings={settings} onChange={onChange} t={t} />
          )}
          {tab === "agent" && (
            <AgentOnboardingSection vaultRoot={vaultRoot} t={t} />
          )}
          {tab === "diagnostics" && (
            <DiagnosticsTab
              t={t}
              logStatus={logStatus}
              setLogStatus={setLogStatus}
              exportPath={exportPath}
              setExportPath={setExportPath}
              exportErr={exportErr}
              setExportErr={setExportErr}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── General ───────────────────── */

function GeneralTab({
  settings,
  onChange,
  t,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  t: TFunc;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-[12px] text-subtext">
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

      <label className="block text-[12px] text-subtext">
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

      <label className="block text-[12px] text-subtext">
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
      <p className="-mt-1 text-[11px] text-overlay">
        {t("settings.defaultEditModeHint")}
      </p>

      <label className="block text-[12px] text-subtext">
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
      <p className="-mt-1 text-[11px] text-overlay">
        {t("settings.attachmentsDirHint")}
      </p>

      <label className="block text-[12px] text-subtext">
        <span className="mb-1 block text-overlay">
          {t("settings.attachmentLayout")}
        </span>
        <select
          className="w-full rounded border border-crust bg-base px-2 py-1.5 text-text"
          value={settings.attachmentLayout}
          data-testid="settings-attachment-layout"
          onChange={(e) =>
            onChange({
              attachmentLayout: e.target.value as AttachmentLayout,
            })
          }
        >
          <option value="folder-note">
            {t("settings.attachmentLayout.folderNote")}
          </option>
          <option value="folder-date">
            {t("settings.attachmentLayout.folderDate")}
          </option>
          <option value="folder">
            {t("settings.attachmentLayout.folder")}
          </option>
          <option value="note-folder">
            {t("settings.attachmentLayout.noteFolder")}
          </option>
        </select>
      </label>
      <p className="-mt-1 text-[11px] text-overlay">
        {t("settings.attachmentLayoutHint")}
      </p>

      <label className="block text-[12px] text-subtext">
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
      <p className="-mt-1 text-[11px] text-overlay">
        {t("settings.editorLayoutHint")}
      </p>
    </div>
  );
}

/* ───────────────────── Graph ───────────────────── */

function GraphTab({
  settings,
  onChange,
  t,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  t: TFunc;
}) {
  const patchForces = (forces: ForceParams) => onChange({ graphForces: forces });
  return (
    <div>
      <p className="mb-2 text-[11px] text-overlay">
        {t("settings.graphForcesHint")}
      </p>
      <ForceSlider
        label={t("settings.force.center")}
        value={settings.graphForces.center}
        onChange={(v) =>
          patchForces({ ...settings.graphForces, center: v })
        }
      />
      <ForceSlider
        label={t("settings.force.repel")}
        value={settings.graphForces.repel}
        onChange={(v) =>
          patchForces({ ...settings.graphForces, repel: v })
        }
      />
      <ForceSlider
        label={t("settings.force.linkStrength")}
        value={settings.graphForces.linkStrength}
        onChange={(v) =>
          patchForces({ ...settings.graphForces, linkStrength: v })
        }
      />
      <ForceSlider
        label={t("settings.force.linkDistance")}
        value={settings.graphForces.linkDistance}
        onChange={(v) =>
          patchForces({ ...settings.graphForces, linkDistance: v })
        }
      />
      <button
        type="button"
        className="mt-1 w-full rounded border border-crust bg-base px-2 py-1 text-[11px] text-overlay hover:bg-surface"
        onClick={() =>
          patchForces({ center: 1, repel: 1, linkStrength: 1, linkDistance: 1 })
        }
      >
        {t("settings.force.reset")}
      </button>
    </div>
  );
}

/* ───────────────────── Diagnostics ───────────────────── */

function DiagnosticsTab({
  t,
  logStatus,
  setLogStatus,
  exportPath,
  setExportPath,
  exportErr,
  setExportErr,
}: {
  t: TFunc;
  logStatus: LogStatus | null;
  setLogStatus: React.Dispatch<React.SetStateAction<LogStatus | null>>;
  exportPath: string | null;
  setExportPath: React.Dispatch<React.SetStateAction<string | null>>;
  exportErr: string | null;
  setExportErr: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  return (
    <div data-testid="settings-diagnostics">
      <p className="mb-2 text-[11px] text-overlay">{t("settings.diagnosticsHint")}</p>
      {logStatus ? (
        <>
          <p className="mb-1 break-all font-mono text-[11px] text-subtext">
            {logStatus.dir || "—"}
          </p>
          <p className="mb-2 text-[11px] text-overlay">
            {t("settings.logProfile")}: {logStatus.profile}
            {logStatus.sessionId ? ` · session ${logStatus.sessionId}` : ""}
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
                    setLogStatus((s) => (s ? { ...s, profile: next } : s));
                  }
                });
              }}
            >
              <option value="dev">{t("settings.logProfile.dev")}</option>
              <option value="verbose">{t("settings.logProfile.verbose")}</option>
              <option value="prod">{t("settings.logProfile.prod")}</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="w-full rounded border border-crust bg-base px-2 py-1.5 text-[12px] text-text hover:bg-surface"
              data-testid="settings-open-log-dir"
              onClick={() => void openLogDir()}
            >
              {t("settings.openLogDir")}
            </button>
            <button
              type="button"
              className="w-full rounded border border-crust bg-base px-2 py-1.5 text-[12px] text-text hover:bg-surface"
              data-testid="settings-export-logs"
              onClick={() => {
                setExportErr(null);
                void exportLogBundle().then((p) => {
                  if (p) setExportPath(p);
                  else setExportErr(t("settings.exportLogsFailed"));
                });
              }}
            >
              {t("settings.exportLogs")}
            </button>
          </div>
          {exportPath && (
            <p
              className="mt-1 break-all font-mono text-[10px] text-subtext"
              data-testid="settings-export-path"
            >
              {exportPath}
            </p>
          )}
          {exportErr && <p className="mt-1 text-[11px] text-overlay">{exportErr}</p>}
        </>
      ) : (
        <p className="text-[11px] text-overlay">{t("settings.diagnosticsMock")}</p>
      )}
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
