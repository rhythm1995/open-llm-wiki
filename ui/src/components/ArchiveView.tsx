/**
 * ArchiveView —— 归档视图(删除/还原并入 git)。
 *
 * 没有 `.trash/` 平行机制:删除即 git 提交,归档 = 版本库历史浏览器。两个区段:
 *   1. 已删除笔记(`git log --diff-filter=D` 投影):每行 path + 删除日期 + 还原钮。
 *      还原 = `git checkout <删除提交>^ -- <path>`(检出父版本回工作区)。
 *   2. 最近提交(只读时间线,复用 GitPanel 的 git_log_raw + git-parse)。
 *
 * 非 git 仓库(`git_is_repo=false`)渲染空态 + 「初始化 git」按钮(mock 下同样命中)。
 * 组件内 mount effect 自取数(同 QueryPanel 读盘模式),不占全局 state。
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowsClockwise,
  ArrowUUpLeft,
  GitBranch,
  GitCommit,
  Warning,
} from "@phosphor-icons/react";
import { ipc, type DeletedNote } from "../lib/ipc";
import { parseLog, type GitLogEntry } from "../lib/git-parse";
import { formatDateStr } from "../lib/date-format";
import { cn } from "../lib/cn";
import type { VaultActions } from "../lib/store";
import type { TFunc } from "../lib/i18n";

interface Props {
  root: string | null;
  actions: VaultActions;
  t: TFunc;
}

export function ArchiveView({ root, actions, t }: Props) {
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [deleted, setDeleted] = useState<DeletedNote[]>([]);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 行内「还原」执行中的 path(防重入);空 = 空闲。
  const [restoring, setRestoring] = useState<string | null>(null);
  // 「初始化 git」执行中 / 失败信息。
  const [initializing, setInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const mock = ipc.isMock();

  const refresh = useCallback(async () => {
    if (!root) return;
    setLoading(true);
    setError(null);
    try {
      const repo = mock ? false : await ipc.gitIsRepo(root);
      setIsRepo(repo);
      if (repo) {
        const [del, logOut] = await Promise.all([
          ipc.gitDeletedNotes(root),
          ipc.gitLogRaw(root, 30),
        ]);
        setDeleted(del);
        setLog(parseLog(logOut));
      } else {
        setDeleted([]);
        setLog([]);
      }
    } catch (e) {
      setIsRepo(false);
      setDeleted([]);
      setLog([]);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [root, mock]);

  useEffect(() => {
    if (root) void refresh();
    else {
      setIsRepo(null);
      setDeleted([]);
      setLog([]);
      setError(null);
    }
  }, [root, refresh]);

  const restore = useCallback(
    async (path: string) => {
      setRestoring(path);
      setError(null);
      try {
        await actions.restoreNote(path);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setRestoring(null);
      }
    },
    [actions, refresh],
  );

  const initRepo = useCallback(async () => {
    if (!root) return;
    setInitializing(true);
    setInitError(null);
    try {
      await ipc.gitInit(root);
      await refresh();
    } catch (e) {
      setInitError(String(e));
    } finally {
      setInitializing(false);
    }
  }, [root, refresh]);

  const now = Date.now();

  if (!root) {
    return (
      <p className="px-3 py-3 text-[12px] text-overlay">{t("git.empty")}</p>
    );
  }

  // mock 模式:git 不可用 → 空态(与 GitPanel 一致,提示去桌面 app)。
  if (mock) {
    return (
      <div className="px-3 py-3">
        <p className="text-[12px] text-overlay">{t("archive.mockHint")}</p>
      </div>
    );
  }

  // 非 git 仓库:空态 + 初始化入口(geek 优先:一键 git init)。
  if (isRepo === false) {
    return (
      <div className="flex flex-col gap-2 px-3 py-4">
        <div className="flex items-center gap-1.5 text-[12px] text-overlay">
          <GitBranch size={13} />
          <span>{t("archive.notRepo")}</span>
        </div>
        <p className="text-[12px] text-overlay">{t("archive.notRepoHint")}</p>
        <button
          onClick={() => void initRepo()}
          disabled={initializing}
          className="mt-1 flex w-fit items-center gap-1 rounded bg-blue px-2.5 py-1 text-[12px] font-medium text-crust hover:opacity-90 disabled:opacity-50"
        >
          <GitBranch size={13} weight="bold" />
          {initializing ? t("archive.initializing") : t("archive.init")}
        </button>
        {initError && (
          <p className="text-[12px] text-red">
            {t("archive.initFailed", { msg: initError })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-crust bg-mantle px-3 py-1.5">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-overlay">
          {t("archive.section.deleted")}
        </span>
        <div className="ml-2 flex shrink-0 items-center gap-1 text-[11px] text-overlay">
          <span className="tabular-nums">{deleted.length}</span>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            title={t("git.refresh")}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-surface disabled:opacity-50"
          >
            <ArrowsClockwise size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b border-red/40 bg-red/10 px-3 py-1.5 text-[12px] text-red">
          <Warning size={13} weight="bold" className="mt-0.5 shrink-0" />
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-sans">
            {error}
          </pre>
        </div>
      )}

      {/* 已删除笔记(可还原) */}
      {deleted.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-overlay">
          {t("archive.deleted.empty")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {deleted.map((d) => {
            const title = d.title || d.path.split("/").pop()?.replace(/\.md$/i, "") || d.path;
            const isBusy = restoring === d.path;
            return (
              <li key={d.path} className="group relative border-b border-crust/60">
                <button
                  onClick={() => restore(d.path)}
                  disabled={restoring !== null}
                  title={t("archive.restore")}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left",
                    "hover:bg-surface disabled:cursor-default disabled:opacity-60",
                  )}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
                      {title}
                    </span>
                    <span className="shrink-0 text-overlay">
                      <ArrowUUpLeft size={13} />
                    </span>
                  </div>
                  <div className="flex w-full items-center gap-3 text-[11px] text-overlay">
                    <span className="truncate font-mono">{d.path}</span>
                  </div>
                  <div className="text-[11px] text-overlay">
                    {t("list.modified", { date: formatDateStr(d.deleted_at, now) })}
                  </div>
                </button>
                {isBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-base/70 text-[11px] text-subtext">
                    {t("archive.restoring")}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 最近提交(只读时间线) */}
      <div className="mt-2 border-t border-crust px-3 pb-3 pt-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-overlay">
          <GitCommit size={12} />
          {t("archive.section.commits")}
        </div>
        {log.length === 0 ? (
          <p className="text-[12px] text-overlay">{t("git.noHistory")}</p>
        ) : (
          <ul className="space-y-0.5">
            {log.map((c) => (
              <li key={c.hash} className="text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-mauve">
                    {c.hash.slice(0, 7)}
                  </span>
                  <span className="truncate text-subtext">{c.subject}</span>
                </div>
                <div className="text-[11px] text-overlay">
                  {c.author} · {c.date}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
