/**
 * GitPanel —— 中栏:Git 面板(F-GIT)。
 *
 * 展示当前 vault 的 status / log / 提交 / **pull** / **push**。
 * 冲突(UU 等)在 status 刷后高亮横幅列出路径;解决方式诚实告知用户:
 * 在编辑器中打开冲突文件、手改冲突标记后 add+commit,再 pull/push。
 *
 * mock 模式下 git 不可用,显示提示横幅。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  ArrowDown,
  ArrowUp,
  GitCommit,
  Warning,
} from "@phosphor-icons/react";
import { ipc } from "../lib/ipc";
import {
  conflictPaths,
  hasConflicts,
  parseLog,
  parseStatusPorcelain,
  statusLabel,
  type GitLogEntry,
  type GitStatusEntry,
} from "../lib/git-parse";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";

interface Props {
  root: string | null;
  t: TFunc;
}

interface GitState {
  status: GitStatusEntry[];
  log: GitLogEntry[];
}

const BADGE_COLOR: Record<string, string> = {
  新: "text-overlay",
  加: "text-green",
  改: "text-yellow",
  删: "text-red",
  更名: "text-blue",
  拷: "text-teal",
  冲: "text-mauve",
  略: "text-overlay",
};

export function GitPanel({ root, t }: Props) {
  const [data, setData] = useState<GitState>({ status: [], log: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const mock = ipc.isMock();

  const refresh = useCallback(async () => {
    if (!root) return;
    setLoading(true);
    setError(null);
    try {
      const [statusOut, logOut] = await Promise.all([
        ipc.gitStatusRaw(root),
        ipc.gitLogRaw(root),
      ]);
      setData({
        status: parseStatusPorcelain(statusOut),
        log: parseLog(logOut),
      });
    } catch (e) {
      setData({ status: [], log: [] });
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    if (root) void refresh();
    else {
      setData({ status: [], log: [] });
      setError(null);
      setInfo(null);
    }
  }, [root, refresh]);

  const conflicts = useMemo(() => conflictPaths(data.status), [data.status]);
  const conflicted = hasConflicts(data.status);

  const commit = useCallback(async () => {
    if (!root) return;
    const msg = message.trim();
    if (!msg) return;
    setCommitting(true);
    setError(null);
    setInfo(null);
    try {
      await ipc.gitCommit(root, msg);
      setMessage("");
      setInfo(t("git.commitOk"));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }, [root, message, refresh, t]);

  const pull = useCallback(async () => {
    if (!root) return;
    setPulling(true);
    setError(null);
    setInfo(null);
    try {
      const out = await ipc.gitPull(root);
      setInfo(out.trim() || t("git.pullOk"));
      await refresh();
    } catch (e) {
      setError(String(e));
      // 失败后刷 status,露出 UU 冲突行。
      await refresh();
    } finally {
      setPulling(false);
    }
  }, [root, refresh, t]);

  const push = useCallback(async () => {
    if (!root) return;
    setPushing(true);
    setError(null);
    setInfo(null);
    try {
      const out = await ipc.gitPush(root);
      setInfo(out.trim() || t("git.pushOk"));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setPushing(false);
    }
  }, [root, refresh, t]);

  if (!root) {
    return (
      <div
        className="flex h-full items-center justify-center text-overlay"
        data-testid="git-panel"
      >
        <p className="text-[13px]">{t("git.empty")}</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-base p-4"
      data-testid="git-panel"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-semibold text-text">{t("view.git")}</h2>
        <button
          type="button"
          data-testid="git-refresh"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] text-subtext hover:bg-surface disabled:opacity-50"
          title={t("git.refresh")}
        >
          <ArrowsClockwise size={13} className={loading ? "animate-spin" : ""} />
          {t("git.refresh")}
        </button>
        <button
          type="button"
          data-testid="git-pull"
          onClick={() => void pull()}
          disabled={mock || pulling}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] text-subtext hover:bg-surface disabled:opacity-50"
          title={t("git.pull")}
        >
          <ArrowDown size={13} />
          {pulling ? t("git.pulling") : t("git.pull")}
        </button>
        <button
          type="button"
          data-testid="git-push"
          onClick={() => void push()}
          disabled={mock || pushing || conflicted}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] text-subtext hover:bg-surface disabled:opacity-50"
          title={t("git.push")}
        >
          <ArrowUp size={13} />
          {pushing ? t("git.pushing") : t("git.push")}
        </button>
        <span className="truncate text-[11px] text-overlay">{root}</span>
      </div>

      {mock && (
        <div
          data-testid="git-mock-hint"
          className="mb-3 rounded border border-yellow/40 bg-yellow/10 px-2 py-1.5 text-[12px] text-yellow"
        >
          {t("git.mockHint")}
        </div>
      )}

      {conflicted && (
        <div
          data-testid="git-conflicts"
          className="mb-3 rounded border border-mauve/40 bg-mauve/10 px-2 py-1.5 text-[12px] text-mauve"
        >
          <div className="font-medium">{t("git.conflictTitle")}</div>
          <p className="mt-0.5 text-[11px] opacity-90">{t("git.conflictHint")}</p>
          <ul className="mt-1 list-inside list-disc text-[11px]">
            {conflicts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div
          data-testid="git-error"
          className="mb-3 flex items-start gap-2 rounded border border-red/40 bg-red/10 px-2 py-1.5 text-[12px] text-red"
        >
          <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-sans">
            {error}
          </pre>
        </div>
      )}

      {info && !error && (
        <div className="mb-3 rounded border border-green/40 bg-green/10 px-2 py-1.5 text-[12px] text-green">
          <pre className="whitespace-pre-wrap break-all font-sans">{info}</pre>
        </div>
      )}

      {/* 提交(VS Code 式:commit 表单 + 按钮置顶,变更列表在下) */}
      <section className="mb-4">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
          {t("git.commitSection")}
        </div>
        <textarea
          data-testid="git-commit-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("git.commitPlaceholder")}
          rows={2}
          className="w-full resize-none rounded border border-surface bg-base px-2 py-1.5 text-[12px] text-text outline-none focus:border-blue"
        />
        <button
          type="button"
          data-testid="git-commit"
          onClick={() => void commit()}
          disabled={committing || !message.trim()}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded bg-green/20 px-2.5 py-1 text-[12px] text-green hover:bg-green/30 disabled:opacity-40"
        >
          <GitCommit size={13} />
          {committing ? t("git.committing") : t("git.commitAll")}
        </button>
      </section>

      {/* 变更清单 */}
      <section className="mb-4">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
          {t("git.changes", { n: data.status.length })}
        </div>
        {data.status.length === 0 ? (
          <p className="text-[12px] text-overlay">{t("git.clean")}</p>
        ) : (
          <ul className="space-y-0.5">
            {data.status.map((e, i) => {
              const label = statusLabel(e);
              return (
                <li
                  key={`${e.path}-${i}`}
                  className="flex items-center gap-2 text-[12px]"
                >
                  <span
                    className={cn(
                      "w-8 shrink-0 text-center font-mono",
                      BADGE_COLOR[label] ?? "text-subtext",
                    )}
                  >
                    {label}
                  </span>
                  <span className="truncate text-text">{e.path}</span>
                  {e.renamedFrom && (
                    <span className="truncate text-[11px] text-overlay">
                      ← {e.renamedFrom}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 最近提交 */}
      <section>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
          {t("git.recentCommits", { n: data.log.length })}
        </div>
        {data.log.length === 0 ? (
          <p className="text-[12px] text-overlay">{t("git.noHistory")}</p>
        ) : (
          <ul className="space-y-1">
            {data.log.map((c) => (
              <li key={c.hash} className="text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-mauve">
                    {c.hash.slice(0, 7)}
                  </span>
                  <span className="truncate text-text">{c.subject}</span>
                </div>
                <div className="text-[11px] text-overlay">
                  {c.author} · {c.date}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
