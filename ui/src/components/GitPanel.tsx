/**
 * GitPanel —— 中栏:Git 面板(F-GIT)。
 *
 * 展示当前 vault(必须是 git 仓库)的:`git status`(变更清单)、`git log`(最近
 * 提交)、以及"提交全部改动"(`git add -A && git commit -m`)。
 *
 * 数据由 `ipc.gitStatusRaw / gitLogRaw / gitCommit` 拿到 git 原始 stdout,再交给
 * 纯逻辑 `git-parse.ts` 解析。**仅在 Tauri 桌面 app 内、vault 为真正的 git 仓库时
 * 生效**;浏览器 mock 模式下 git 不可用,会显示提示横幅。
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, GitCommit, Warning } from "@phosphor-icons/react";
import { ipc } from "../lib/ipc";
import {
  parseLog,
  parseStatusPorcelain,
  statusLabel,
  type GitLogEntry,
  type GitStatusEntry,
} from "../lib/git-parse";
import { cn } from "../lib/cn";

interface Props {
  root: string | null;
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

export function GitPanel({ root }: Props) {
  const [data, setData] = useState<GitState>({ status: [], log: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
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
    }
  }, [root, refresh]);

  const commit = useCallback(async () => {
    if (!root) return;
    const msg = message.trim();
    if (!msg) return;
    setCommitting(true);
    setError(null);
    try {
      await ipc.gitCommit(root, msg);
      setMessage("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  }, [root, message, refresh]);

  if (!root) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">未打开 vault。</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-text">Git</h2>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] text-subtext hover:bg-surface disabled:opacity-50"
          title="刷新"
        >
          <ArrowsClockwise size={13} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
        <span className="truncate text-[11px] text-overlay">{root}</span>
      </div>

      {mock && (
        <div className="mb-3 rounded border border-yellow/40 bg-yellow/10 px-2 py-1.5 text-[12px] text-yellow">
          mock 模式:git 命令不可用。请在桌面 app 中打开一个 git 仓库后使用。
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-red/40 bg-red/10 px-2 py-1.5 text-[12px] text-red">
          <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-sans">
            {error}
          </pre>
        </div>
      )}

      {/* 变更清单 */}
      <section className="mb-4">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
          变更({data.status.length})
        </div>
        {data.status.length === 0 ? (
          <p className="text-[12px] text-overlay">工作区干净,无待提交改动。</p>
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

      {/* 提交 */}
      <section className="mb-4">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
          提交(git add -A + commit)
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="提交信息…"
          rows={2}
          className="w-full resize-none rounded border border-surface bg-base px-2 py-1.5 text-[12px] text-text outline-none focus:border-blue"
        />
        <button
          onClick={() => void commit()}
          disabled={committing || !message.trim()}
          className="mt-1.5 flex items-center gap-1 rounded bg-green/20 px-2.5 py-1 text-[12px] text-green hover:bg-green/30 disabled:opacity-40"
        >
          <GitCommit size={13} />
          {committing ? "提交中…" : "提交全部改动"}
        </button>
      </section>

      {/* 最近提交 */}
      <section>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-overlay">
          最近提交({data.log.length})
        </div>
        {data.log.length === 0 ? (
          <p className="text-[12px] text-overlay">无提交历史。</p>
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
