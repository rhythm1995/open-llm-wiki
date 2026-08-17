/**
 * Settings「Agent 记忆接入」子面板(B-MCP-ONBOARD 桌面侧)。
 *
 * 主路径:**一键接入** — 自动解析 mcp 二进制 + 记忆 vault(当前打开的 vault
 * 或 ~/Open LLM Wiki-Memory),对已检测到的 agent 批量接线。
 * 高级区可改路径 / 单独勾选 agent / 诊断 / 播种。
 */
import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type {
  OnboardActionResult,
  OnboardCheck,
  OnboardScan,
} from "../lib/ipc";
import type { TFunc } from "../lib/i18n";
import { AgentIcon } from "../lib/agent-icons";
import { cn } from "../lib/cn";
import { WIKI_SKILLS_NPX_CMD } from "../lib/wiki-digest";

const DEFAULT_VAULT_NAME = "Open LLM Wiki-Memory";

interface Props {
  /** 当前打开的 vault 根(一键接入优先使用)。 */
  vaultRoot: string | null;
  t: TFunc;
}

function defaultVaultPath(home: string, vaultRoot: string | null): string {
  if (vaultRoot?.trim()) return vaultRoot.trim();
  // home 来自后端 onboard_scan;无则走相对占位,apply 时再校验。
  const h = home.replace(/\/+$/, "");
  return h ? `${h}/${DEFAULT_VAULT_NAME}` : `~/${DEFAULT_VAULT_NAME}`;
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await ipc.onboardScan();
      setScan(s);
      const bin = s.resolved_binary || "";
      const v = defaultVaultPath(s.home, vaultRoot);
      setBinary(bin);
      setVault(v);
      setSelected(
        new Set(
          s.agents
            .filter((a) => a.present && !a.manual_only)
            .map((a) => a.id),
        ),
      );
      return s;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [vaultRoot]);

  useEffect(() => {
    if (ipc.isMock()) return;
    void scanNow();
  }, [scanNow]);

  // 打开 vault 后同步默认记忆路径(用户未改高级区时)。
  useEffect(() => {
    if (vaultRoot?.trim()) {
      setVault((prev) => {
        // 若仍是默认 Memory 名或空,跟当前 vault
        if (!prev.trim() || prev.endsWith(DEFAULT_VAULT_NAME)) {
          return vaultRoot.trim();
        }
        return prev;
      });
    }
  }, [vaultRoot]);

  const resolvePaths = async (): Promise<{
    binary: string;
    vault: string;
    ids: string[];
  } | null> => {
    // 再扫一次 + 必要时单独 resolve:路径由后端自动填,用户无需手填。
    const s = await ipc.onboardScan();
    setScan(s);
    let bin = (binary.trim() || s.resolved_binary || "").trim();
    if (!bin) {
      try {
        bin = (await ipc.onboardResolveBinary())?.trim() || "";
      } catch {
        bin = "";
      }
    }
    // 记忆 vault:高级区已填 → 当前打开的 vault → ~/Open LLM Wiki-Memory
    const v = (
      vault.trim() ||
      vaultRoot?.trim() ||
      defaultVaultPath(s.home, vaultRoot)
    ).trim();
    setBinary(bin);
    setVault(v);
    const ids =
      selected.size > 0
        ? [...selected]
        : s.agents
            .filter((a) => a.present && !a.manual_only)
            .map((a) => a.id);
    setSelected(new Set(ids));
    if (!bin) {
      setError(t("settings.onboard.needBinary"));
      setShowAdvanced(true);
      return null;
    }
    if (!v) {
      setError(t("settings.onboard.needVault"));
      setShowAdvanced(true);
      return null;
    }
    if (ids.length === 0) {
      setError(t("settings.onboard.needAgent"));
      return null;
    }
    return { binary: bin, vault: v, ids };
  };

  /** 一键:解析路径 → 可选播种空 vault → 接入所有已检测 agent。 */
  const oneClickConnect = async () => {
    setBusy(true);
    setResults(null);
    setError(null);
    setSeedMsg(null);
    try {
      const paths = await resolvePaths();
      if (!paths) return;
      // 若 vault 目录尚无笔记,尝试播种 starter(force 不覆盖已有文件)
      try {
        const r = await ipc.onboardInit(paths.vault, true);
        if (r.written.length > 0) {
          setSeedMsg(
            t("settings.onboard.initDone", {
              written: r.written.length,
              skipped: r.skipped.length,
            }),
          );
        }
      } catch {
        // 目录已有内容或无写权限时忽略,直接尝试接入
      }
      const rs = await ipc.onboardApply(
        paths.binary,
        paths.vault,
        paths.ids,
      );
      setResults(rs);
      // 给当前工作 vault 补装 wiki-ingest skill(提炼所需;幂等,永不覆盖已有)。
      // vaultRoot 优先;未开 vault 时回退记忆 vault(paths.vault)。装失败不阻断 MCP 接入。
      const skillDir = vaultRoot?.trim() || paths.vault;
      try {
        const sk = await ipc.onboardInstallSkill(skillDir);
        if (sk.written.length > 0) {
          setSeedMsg(t("settings.onboard.skillInstalled"));
        }
      } catch {
        /* skill 装失败:用户仍可走下方 npx 命令手动补装 */
      }
      const s = await ipc.onboardScan();
      setScan(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (remove: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) {
      setError(t("settings.onboard.needAgent"));
      return;
    }
    if (!remove) {
      const paths = await resolvePaths();
      if (!paths) return;
      setBusy(true);
      setResults(null);
      setError(null);
      try {
        const rs = await ipc.onboardApply(
          paths.binary,
          paths.vault,
          paths.ids,
        );
        setResults(rs);
        const s = await ipc.onboardScan();
        setScan(s);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setResults(null);
    setError(null);
    try {
      const rs = await ipc.onboardRemove(ids);
      setResults(rs);
      const s = await ipc.onboardScan();
      setScan(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doctor = async () => {
    setBusy(true);
    setError(null);
    try {
      const paths = await resolvePaths();
      if (!paths) return;
      setChecks(
        await ipc.onboardDoctor(paths.vault, paths.binary || null),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    setBusy(true);
    setError(null);
    setSeedMsg(null);
    try {
      const paths = await resolvePaths();
      if (!paths) return;
      if (!window.confirm(t("settings.onboard.initConfirm"))) return;
      const r = await ipc.onboardInit(paths.vault, true);
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

  const presentCount =
    scan?.agents.filter((a) => a.present && !a.manual_only).length ?? 0;
  const wiredCount =
    scan?.agents.filter((a) => a.wired_command).length ?? 0;

  const [skillsCopied, setSkillsCopied] = useState(false);

  const copySkillsNpx = async () => {
    try {
      await navigator.clipboard.writeText(WIKI_SKILLS_NPX_CMD);
      setSkillsCopied(true);
      window.setTimeout(() => setSkillsCopied(false), 2000);
    } catch {
      setError(t("settings.onboard.copyFailed"));
    }
  };

  return (
    <div className="pt-1" data-testid="settings-onboarding">
      <div className="mb-1 text-[13px] font-semibold text-text">
        {t("settings.onboard.title")}
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-subtext">
        {t("settings.onboard.hint")}
      </p>

      {/* Skills / Hooks：分步引导 + GitHub npx */}
      <div
        className="mb-4 rounded-lg border border-crust bg-base px-3 py-2"
        data-testid="settings-skills-hooks"
      >
        <div className="mb-1 text-[12px] font-semibold text-text">
          {t("settings.skillsHooks.title")}
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-subtext">
          {t("settings.skillsHooks.hint")}
        </p>
        <ol className="mb-2 list-none space-y-1 text-[11px] leading-relaxed text-subtext">
          <li>{t("settings.skillsHooks.step1")}</li>
          <li>{t("settings.skillsHooks.step2")}</li>
          <li>{t("settings.skillsHooks.step3")}</li>
          <li>{t("settings.skillsHooks.step4")}</li>
        </ol>
        <div className="mb-1 text-[10px] text-overlay">
          {t("settings.skillsHooks.npxLabel")}
        </div>
        <div className="flex gap-1">
          <code
            className="min-w-0 flex-1 overflow-x-auto rounded border border-crust bg-mantle px-2 py-1.5 font-mono text-[10px] text-text"
            data-testid="settings-skills-hooks-cmd"
          >
            {WIKI_SKILLS_NPX_CMD}
          </code>
          <button
            type="button"
            className="shrink-0 rounded border border-crust bg-mantle px-2 py-1 text-[11px] text-text hover:bg-surface"
            data-testid="settings-skills-hooks-copy"
            onClick={() => void copySkillsNpx()}
          >
            {skillsCopied
              ? t("settings.skillsHooks.copied")
              : t("settings.skillsHooks.copy")}
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-overlay">
          {t("settings.skillsHooks.hooksNote")}
        </p>
      </div>

      {ipc.isMock() ? (
        <p
          className="text-[11px] text-overlay"
          data-testid="settings-onboard-mock"
        >
          {t("settings.onboard.mock")}
        </p>
      ) : (
        <>
          {/* 状态摘要 */}
          <div className="mb-3 rounded-lg border border-crust bg-mantle px-3 py-2 text-[11px] text-subtext">
            {scan == null && busy ? (
              t("settings.onboard.scanning")
            ) : (
              <>
                <div>
                  {t("settings.onboard.statusBinary")}:{" "}
                  <span className="font-mono text-text">
                    {binary
                      ? t("settings.onboard.statusOk")
                      : t("settings.onboard.statusMissing")}
                  </span>
                </div>
                <div className="mt-0.5 truncate" title={vault}>
                  {t("settings.onboard.statusVault")}:{" "}
                  <span className="font-mono text-text">
                    {vault || "—"}
                  </span>
                </div>
                <div className="mt-0.5">
                  {t("settings.onboard.statusAgents", {
                    present: presentCount,
                    wired: wiredCount,
                  })}
                </div>
              </>
            )}
          </div>

          {/* 一键接入 */}
          <button
            type="button"
            data-testid="settings-onboard-oneclick"
            disabled={busy}
            onClick={() => void oneClickConnect()}
            className="mb-2 flex h-10 w-full items-center justify-center rounded-lg bg-blue px-3 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? t("settings.onboard.working")
              : t("settings.onboard.oneClick")}
          </button>
          <p className="mb-3 text-[11px] leading-relaxed text-overlay">
            {t("settings.onboard.oneClickHint")}
          </p>

          {/* 各 agent 记忆接入情况(只读卡片列表,风格对齐右栏 Agent picker)。 */}
          {scan && scan.agents.length > 0 && (
            <div
              className="mb-3"
              data-testid="settings-onboard-agentlist"
            >
              <div className="mb-1 text-[11px] text-overlay">
                {t("settings.onboard.agentList")}
              </div>
              <ul className="flex flex-col gap-1">
                {scan.agents.map((a) => (
                  <li
                    key={a.id}
                    data-testid={`settings-onboard-agentinfo-${a.id}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded border border-crust bg-mantle px-2.5 py-2",
                      !a.present && !a.manual_only && "opacity-60",
                    )}
                  >
                    <AgentIcon id={a.id} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] font-medium text-text">
                          {a.label}
                        </span>
                        <StatusChip a={a} t={t} />
                      </div>
                      {/* 接入情况明细:配置错误优先 → 已接入时显接入 vault → 检测证据/提示。 */}
                      {(a.config_error ||
                        a.wired_vault ||
                        a.evidence[0] ||
                        a.hints[0]) && (
                        <p
                          className="truncate font-mono text-[10px] text-overlay"
                          title={
                            a.config_error ??
                            a.wired_vault ??
                            a.evidence[0] ??
                            a.hints[0] ??
                            ""
                          }
                        >
                          {a.config_error ??
                            (a.wired_vault
                              ? `${t("settings.onboard.wiredVault")}: ${a.wired_vault}`
                              : (a.evidence[0] ?? a.hints[0]))}
                        </p>
                      )}
                      {a.manual_only && a.note && (
                        <p className="text-[10px] text-overlay">{a.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results && (
            <ul
              className="mb-2 flex flex-col gap-0.5"
              data-testid="settings-onboard-results"
            >
              {results.map((r) => (
                <li
                  key={r.id}
                  className={`break-all font-mono text-[10px] ${
                    r.ok
                      ? "text-[var(--color-green)]"
                      : "text-[var(--color-red)]"
                  }`}
                >
                  [{r.ok ? "ok" : "!!"}] {r.id}: {r.message}
                </li>
              ))}
            </ul>
          )}
          {seedMsg && (
            <p
              className="mb-2 text-[11px] text-subtext"
              data-testid="settings-onboard-seedmsg"
            >
              {seedMsg}
            </p>
          )}
          {error && (
            <p
              className="mb-2 text-[11px] text-[var(--color-red)]"
              data-testid="settings-onboard-error"
            >
              {error}
            </p>
          )}

          <p className="mb-3 text-[10px] text-overlay">
            {t("settings.onboard.restartHint")}
          </p>

          {/* 高级 */}
          <button
            type="button"
            className="mb-2 text-[11px] text-overlay underline hover:text-text"
            data-testid="settings-onboard-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced
              ? t("settings.onboard.hideAdvanced")
              : t("settings.onboard.showAdvanced")}
          </button>

          {showAdvanced && (
            <div className="mb-2 space-y-2 rounded-lg border border-crust p-2">
              <label className="block text-[12px] text-subtext">
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
                    placeholder="open-llm-wiki-mcp"
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

              <label className="block text-[12px] text-subtext">
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
                  placeholder={`~/${DEFAULT_VAULT_NAME}`}
                />
              </label>

              <div className="text-[11px] text-overlay">
                {t("settings.onboard.agents")}
              </div>
              <ul className="flex flex-col gap-1">
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
                        <AgentIcon id={a.id} size={18} />
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

              <div className="flex flex-wrap gap-1">
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

              {checks && (
                <ul
                  className="flex flex-col gap-0.5"
                  data-testid="settings-onboard-checks"
                >
                  {checks.map((c) => (
                    <li
                      key={`${c.name}-${c.detail}`}
                      className="flex gap-1 text-[11px]"
                    >
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

              <div className="flex items-center justify-between">
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
                  {copied
                    ? t("settings.onboard.copied")
                    : t("settings.onboard.copy")}
                </button>
              </div>
              {showGuidance && scan && (
                <pre
                  className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-crust bg-base p-2 font-mono text-[10px] text-subtext"
                  data-testid="settings-onboard-guidance"
                >
                  {scan.guidance}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
