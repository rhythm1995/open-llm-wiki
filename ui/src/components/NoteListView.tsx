/**
 * NoteListView —— 中间列表(四区布局的第二区)。
 *
 * 据 Nav 的 `navSelection` 在 `snapshot.nodes` 上客户端过滤并按 modified 倒序展示。
 * 每行:标题 + 正文预览(2 行)+ 更新/创建日期 + 状态 chip(复用 status-chip 色桶)。
 * 点击 → 选中笔记(编辑器加载,列表保持)。kind:"query" 时读盘抠 qql 跑 ipc.runQql。
 * kind:"archive" 时交给 {@link ArchiveView}(删除/还原已并入 git,无 `.trash/`)。
 *
 * 不复用 SearchPanel/QueryPanel:那些是带输入框的主动查询面板;本组件是被动的
 * "当前 Nav 选择的结果列表",职责单一。过滤纯逻辑在 nav-filter.ts,日期在 date-format.ts。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeOut, VaultSnapshot } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { NavSelection } from "../lib/nav-filter";
import { filterByNav, selectionLabel } from "../lib/nav-filter";
import { extractQueryFromNote } from "../lib/saved-query";
import { statusChipClass } from "../lib/status-chip";
import { formatDateStr, formatMs } from "../lib/date-format";
import { ArchiveView } from "./ArchiveView";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";

interface Props {
  root: string | null;
  snapshot: VaultSnapshot | null;
  currentPath: string | null;
  navSelection: NavSelection | null;
  /** 正在 inline 重命名的笔记 path(任务3);命中行渲染为输入框,null=无。 */
  renamingPath: string | null;
  onRenameCommit: (path: string, value: string) => void;
  onRenameCancel: () => void;
  actions: VaultActions;
  t: TFunc;
}

export function NoteListView({
  root,
  snapshot,
  currentPath,
  navSelection,
  renamingPath,
  onRenameCommit,
  onRenameCancel,
  actions,
  t,
}: Props) {
  // kind:"query" 的结果(异步读盘+跑 QQL);null = 未查询/加载中。
  const [queryNodes, setQueryNodes] = useState<NodeOut[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    if (!navSelection || navSelection.kind !== "query") {
      setQueryNodes(null);
      setQueryError(null);
      return;
    }
    if (!root || !snapshot) return;
    let cancelled = false;
    (async () => {
      try {
        const content = await ipc.readNote(root, navSelection.id);
        const qql = extractQueryFromNote(content);
        if (!qql) {
          if (!cancelled) setQueryNodes([]);
          return;
        }
        const rs = await ipc.runQql(root, qql);
        if (cancelled) return;
        const ids = "List" in rs ? rs.List : [];
        const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
        setQueryNodes(ids.map((id) => byId.get(id)).filter((n): n is NodeOut => !!n));
      } catch (e) {
        if (!cancelled) setQueryError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navSelection, root, snapshot]);

  const nodes = useMemo(() => {
    const all = snapshot?.nodes ?? [];
    if (!navSelection) return all;
    if (navSelection.kind === "query") return queryNodes ?? [];
    return filterByNav(all, navSelection);
  }, [snapshot, navSelection, queryNodes]);

  // 按 modified 倒序(最近改的在上);缺失 mtime 视为 0 排末尾。
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => (b.modified || 0) - (a.modified || 0)),
    [nodes],
  );

  const now = Date.now();

  // 列表头顶部的选择标签(描述当前过滤范围)。
  const label = useMemo(() => {
    const nodes = snapshot?.nodes ?? [];
    return navSelection ? selectionLabel(navSelection, nodes, t) : t("nav.allNotes");
  }, [navSelection, snapshot, t]);

  const emptyKey = (() => {
    const k = navSelection?.kind ?? "all";
    return `list.empty.${k}`;
  })();

  const isQueryLoading =
    navSelection?.kind === "query" && queryNodes === null && !queryError;

  // archive:委派给 ArchiveView(删除/还原并入 git,组件内自取数)。
  // 放在所有 hook 之后,保证 hook 调用数与选择类型无关。
  if (navSelection?.kind === "archive") {
    return <ArchiveView root={root} actions={actions} t={t} />;
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-crust bg-mantle px-3 py-1.5">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-overlay">
          {label}
        </span>
        <span className="ml-2 shrink-0 text-[11px] tabular-nums text-overlay">
          {sorted.length}
        </span>
      </div>

      {queryError && (
        <p className="px-3 py-2 text-[12px] text-red">{queryError}</p>
      )}

      {isQueryLoading ? (
        <p className="px-3 py-2 text-[12px] text-overlay">{t("list.loading")}</p>
      ) : sorted.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-overlay">{t(emptyKey)}</p>
      ) : (
        <ul className="flex flex-col">
          {sorted.map((n) => {
            const active = currentPath === n.path;
            const title = n.title || n.path.split("/").pop()?.replace(/\.md$/i, "") || n.path;
            const renaming = n.path === renamingPath;
            return (
              <li key={n.path} className="border-b border-crust/60">
                {renaming ? (
                  <div className="px-3 py-2">
                    <RenameInput
                      initial={title}
                      onCommit={(v) => onRenameCommit(n.path, v)}
                      onCancel={onRenameCancel}
                    />
                  </div>
                ) : (
                <button
                  onClick={() => actions.selectNote(n.path)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left",
                    active ? "bg-surface2" : "hover:bg-surface",
                  )}
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[13px] font-medium",
                        active ? "text-text" : "text-text",
                      )}
                    >
                      {title}
                    </span>
                    {n.status && (
                      <span
                        className={cn(
                          "shrink-0 rounded px-1 py-px text-[10px] font-medium",
                          statusChipClass(n.status),
                        )}
                      >
                        {n.status}
                      </span>
                    )}
                  </div>
                  {n.preview && (
                    <p className="line-clamp-2 w-full text-[12px] leading-snug text-subtext">
                      {n.preview}
                    </p>
                  )}
                  <div className="mt-0.5 flex w-full items-center gap-3 text-[11px] text-overlay">
                    <span>{t("list.modified", { date: formatMs(n.modified, now) })}</span>
                    {n.created && (
                      <span>{t("list.created", { date: formatDateStr(n.created, now) })}</span>
                    )}
                  </div>
                </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** inline 标题重命名输入框(任务3):挂载即聚焦+全选,回车提交 / Esc 取消 / blur 提交。 */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(v);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(v)}
      className="w-full rounded border border-blue bg-base px-2 py-1.5 text-[13px] font-medium text-text outline-none"
    />
  );
}
