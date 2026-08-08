/**
 * Settings「Agent 记忆接入」子面板(B-MCP-ONBOARD 桌面侧)。
 *
 * 与 CLI `openobs-mcp setup/doctor/init` 复用同一套探测/接线/播种逻辑
 * (tauri command → openobs_mcp::onboard)。mock 模式(浏览器 dev)展示占位。
 *
 * 安全语义与 CLI 一致:真写必备份 + 原子 rename;不可解析的配置文件绝不触碰
 * (对应 agent 行展示原因);引导文本只复制、绝不代写进任何用户文件。
 */
import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type {
  OnboardActionResult,
  OnboardCheck,
  OnboardScan,
} from "../lib/ipc";
import type { TFunc } from "../lib/i18n";

interface Props {
  /** 当前打开的 vault 根(记忆 vault 输入框的默认值)。 */
  vaultRoot: string | null;
  t: TFunc;
}

export function AgentOnboardingSection({ vaultRoot, t }: Props) {
  const [scan, setScan] = useState<OnboardScan | null>(null);
  const [binary, setBinary] = useState("");
  const [vault, setVault] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<OnboardActionResult[] | null>(null);
  const [checks, setChecks] = useState<OnboardCheck[] | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await ipc.onboardScan();
      setScan(s);
      setBinary((b) => b || s.resolved_binary || "");
      setVault((v) => v || vaultRoot || "");
      setSelected(
        new Set(
          s.agents
            .filter((a) => a.present && !a.manual_only)
            .map((a) => a.id),
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [vaultRoot]);

  useEffect(() => {
    if (ipc.isMock()) return;
    void scanNow();
  }, [scanNow]);

  const apply = async (remove: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!remove && (!binary.trim() || !vault.trim())) {
      setError(t("settings.onboard.required"));
      return;
    }
    setBusy(true);
    setResults(null);
    setError(null);
    try {
      const rs = remove
        ? await ipc.onboardRemove(ids)
        : await ipc.onboardApply(binary.trim(), vault.trim(), ids);
      setResults(rs);
      // 刷新各行 wired 状态。
      const s = await ipc.onboardScan();
      setScan(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doctor = async () => {
    if (!vault.trim()) {
      setError(t("settings.onboard.required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setChecks(await ipc.onboardDoctor(vault.trim(), binary.trim() || null));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    if (!vault.trim()) {
      setError(t("settings.onboard.required"));
      return;
    }
    if (!window.confirm(t("settings.onboard.initConfirm"))) return;
    setBusy(true);
    setError(null);
    setSeedMsg(null);
    try {
      const r = await ipc.onboardInit(vault.trim(), true);
      setSeedMsg(
        t("settings.onboard.initDone", {
          written: r.written.length,
          skipped: r.skipped.length,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyGuidance = async () => {
    const text = scan?.guidance ?? (await ipc.onboardGuidance());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("settings.onboard.copyFailed"));
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="mt-4 border-t border-crust pt-3"
      data-testid="settings-onboarding"
    >
      <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
        {t("settings.onboard.title")}
      </div>
      <p className="mb-2 text-[11px] text-overlay">
        {t("settings.onboard.hint")}
      </p>

      {ipc.isMock() ? (
        <p
          className="text-[11px] text-overlay"
          data-testid="settings-onboard-mock"
        >
          {t("settings.onboard.mock")}
        </p>
      ) : (
        <>
          <label className="mb-2 block text-[12px] text-subtext">
            <span className="mb-1 block text-overlay">
              {t("settings.onboard.binary")}
            </span>
            <div className="flex gap-1">
              <input
                type="text"
                className="min-w-0 flex-1 rounded border border-crust bg-base px-2 py-1.5 font-mono text-[11px] text-text"
                value={binary}
                data-testid="settings-onboard-binary"
                onChange={(e) => setBinary(e.target.value)}
                spellCheck={false}
                placeholder="openobs-mcp"
              />
              <button
                type="button"
                className="shrink-0 rounded border border-crust bg-base px-2 py-1 text-[11px] text-text hover:bg-surface"
                data-testid="settings-onboard-pick"
                disabled={busy}
                onClick={() =>
                  void ipc
                    .onboardPickBinary()
                    .then((p) => p && setBinary(p))
                    .catch((e) => setError(String(e)))
                }
              >
                {t("settings.onboard.browse")}
              </button>
            </div>
          </label>

          <label className="mb-2 block text-[12px] text-subtext">
            <span className="mb-1 block text-overlay">
              {t("settings.onboard.vault")}
            </span>
            <input
              type="text"
              className="w-full rounded border border-crust bg-base px-2 py-1.5 font-mono text-[11px] text-text"
              value={vault}
              data-testid="settings-onboard-vault"
              onChange={(e) => setVault(e.target.value)}
              spellCheck={false}
              placeholder="~/OpenObsidian-Memory"
            />
          </label>

          <div className="mb-1 text-[11px] text-overlay">
            {t("settings.onboard.agents")}
          </div>
          {scan == null && busy && (
            <p className="text-[11px] text-overlay">
              {t("settings.onboard.scanning")}
            </p>
          )}
          <ul className="mb-2 flex flex-col gap-1">
            {(scan?.agents ?? []).map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 rounded border border-crust bg-base px-2 py-1.5"
                data-testid={`settings-onboard-agent-${a.id}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(a.id)}
                  disabled={a.manual_only || busy}
                  onChange={() => toggle(a.id)}
                  aria-label={a.label}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-text">{a.label}</span>
                    <StatusChip a={a} t={t} />
                  </div>
                  {(a.evidence[0] || a.hints[0] || a.config_error) && (
                    <p className="truncate font-mono text-[10px] text-overlay">
                      {a.config_error ?? a.evidence[0] ?? a.hints[0]}
                    </p>
                  )}
                  {a.manual_only && (
                    <p className="text-[10px] text-overlay">{a.note}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="mb-2 flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-crust bg-base px-2 py-1 text-[11px] text-text hover:bg-surface disabled:opacity-50"
              data-testid="settings-onboard-connect"
              disabled={busy || selected.size === 0}
              onClick={() => void apply(false)}
            >
              {t("settings.onboard.connect")}
            </button>
            <button
              type="button"
              className="rounded border border-crust bg-base px-2 py-1 text-[11px] text-text hover:bg-surface disabled:opacity-50"
              data-testid="settings-onboard-disconnect"
              disabled={busy || selected.size === 0}
              onClick={() => void apply(true)}
            >
              {t("settings.onboard.disconnect")}
            </button>
            <button
              type="button"
              className="rounded border border-crust bg-base px-2 py-1 text-[11px] text-text hover:bg-surface disabled:opacity-50"
              data-testid="settings-onboard-doctor"
              disabled={busy}
              onClick={() => void doctor()}
            >
              {t("settings.onboard.doctor")}
            </button>
            <button
              type="button"
              className="rounded border border-crust bg-base px-2 py-1 text-[11px] text-text hover:bg-surface disabled:opacity-50"
              data-testid="settings-onboard-init"
              disabled={busy}
              onClick={() => void seed()}
            >
              {t("settings.onboard.init")}
            </button>
            <button
              type="button"
              className="rounded border border-crust bg-base px-2 py-1 text-[11px] text-text hover:bg-surface disabled:opacity-50"
              data-testid="settings-onboard-rescan"
              disabled={busy}
              onClick={() => void scanNow()}
            >
              {t("settings.onboard.rescan")}
            </button>
          </div>

          {results && (
            <ul className="mb-2 flex flex-col gap-0.5" data-testid="settings-onboard-results">
              {results.map((r) => (
                <li
                  key={r.id}
                  className={`break-all font-mono text-[10px] ${
                    r.ok ? "text-[var(--color-green)]" : "text-[var(--color-red)]"
                  }`}
                >
                  [{r.ok ? "ok" : "!!"}] {r.id}: {r.message}
                </li>
              ))}
            </ul>
          )}

          {checks && (
            <ul className="mb-2 flex flex-col gap-0.5" data-testid="settings-onboard-checks">
              {checks.map((c) => (
                <li key={`${c.name}-${c.detail}`} className="flex gap-1 text-[11px]">
                  <span
                    className={
                      c.status === "ok"
                        ? "text-[var(--color-green)]"
                        : c.status === "warn"
                          ? "text-[var(--color-yellow)]"
                          : "text-[var(--color-red)]"
                    }
                  >
                    [{c.status}]
                  </span>
                  <span className="break-all text-subtext">
                    {c.name}: {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {seedMsg && (
            <p className="mb-2 text-[11px] text-subtext" data-testid="settings-onboard-seedmsg">
              {seedMsg}
            </p>
          )}
          {error && (
            <p className="mb-2 text-[11px] text-[var(--color-red)]" data-testid="settings-onboard-error">
              {error}
            </p>
          )}

          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              className="text-[11px] text-overlay underline hover:text-text"
              data-testid="settings-onboard-guidance-toggle"
              onClick={() => setShowGuidance((v) => !v)}
            >
              {t("settings.onboard.guidance")}
            </button>
            <button
              type="button"
              className="rounded border border-crust bg-base px-2 py-0.5 text-[11px] text-text hover:bg-surface"
              data-testid="settings-onboard-copy"
              onClick={() => void copyGuidance()}
            >
              {copied ? t("settings.onboard.copied") : t("settings.onboard.copy")}
            </button>
          </div>
          {showGuidance && scan && (
            <pre
              className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-crust bg-base p-2 font-mono text-[10px] text-subtext"
              data-testid="settings-onboard-guidance"
            >
              {scan.guidance}
            </pre>
          )}
          <p className="text-[10px] text-overlay">
            {t("settings.onboard.restartHint")}
          </p>
        </>
      )}
    </div>
  );
}

/** agent 行的状态徽章:已接入 / 未接入 / 仅手动 / 配置不可解析 / 未检测到。 */
function StatusChip({
  a,
  t,
}: {
  a: {
    manual_only: boolean;
    present: boolean;
    config_error: string | null;
    wired_command: string | null;
  };
  t: TFunc;
}) {
  let label: string;
  let cls = "bg-surface text-overlay";
  if (a.config_error) {
    label = t("settings.onboard.configError");
    cls = "bg-[var(--color-yellow)]/20 text-[var(--color-yellow)]";
  } else if (a.manual_only) {
    label = t("settings.onboard.manualOnly");
  } else if (a.wired_command) {
    label = t("settings.onboard.wired");
    cls = "bg-[var(--color-green)]/20 text-[var(--color-green)]";
  } else if (a.present) {
    label = t("settings.onboard.notWired");
  } else {
    label = t("settings.onboard.notDetected");
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>{label}</span>
  );
}
