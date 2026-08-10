/**
 * NoteListView —— 中间列表(四区布局的第二区)。
 *
 * 据 Nav 的 `navSelection` 在 `snapshot.nodes` 上客户端过滤并按 modified 倒序展示。
 * 每行:标题 + 正文预览(2 行)+ 更新/创建日期 + 状态 chip(复用 status-chip 色桶)。
 * 点击 → 选中笔记(编辑器加载,列表保持)。
 * kind:"archive" 时交给 {@link ArchiveView}(删除/还原已并入 git,无 `.trash/`)。
 *
 * 表头顶是一个**即时过滤框**:按 title+preview 子串收窄「当前 Nav 选择
 * 的列表」。这与第三栏的两种搜索职责不同 —— 过滤只看当前列表的标题/预览,⌘F 看当前
 * 笔记正文,⌘⇧F 看全库正文。把表头从静态标签改成输入框,也顺带消除了「点 search 后
 * 第二栏仍高亮『全部笔记』」的残留态 bug(表头不再是会被误读为高亮的标签)。
 *
 * 行右键 → 复用 {@link ContextMenu}:重命名 / 复制 [[wikilink]] / 切 status / 归档 /
 * 在 Finder 中显示(桌面专用,mock 下隐藏)。对标常见笔记右键菜单。
 *
 * 过滤纯逻辑在 nav-filter.ts,日期在 date-format.ts,frontmatter 字段写在前段由
 * store.setNoteStatus / frontmatter.ts 处理。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { NodeOut, VaultSnapshot } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { NavSelection } from "../lib/nav-filter";
import { filterByNav, selectionLabel } from "../lib/nav-filter";
import { statusChipClass } from "../lib/status-chip";
import { labelStatus } from "../lib/wiki-labels";
import { formatDateStr, formatMs } from "../lib/date-format";
import { asWikilink } from "../lib/frontmatter";
import { ArchiveView } from "./ArchiveView";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";

/** 状态预设(右键快速切;status 是自由文本,自定义值用 Inspector 改)。 */
const STATUS_PRESETS = ["Active", "Contested", "Superseded", "Draft"];

interface Props {
  root: string | null;
  snapshot: VaultSnapshot | null;
  currentPath: string | null;
  navSelection: NavSelection | null;
  /** 正在 inline 重命名的笔记 path(任务3);命中行渲染为输入框,null=无。 */
  renamingPath: string | null;
  onRenameCommit: (path: string, value: string) => void;
  onRenameCancel: () => void;
  /** 右键「重命名」入口:把该 path 置入 inline 重命名态(由 App 持有 renamingPath)。 */
  onStartRename: (path: string) => void;
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
  onStartRename,
  actions,
  t,
}: Props) {
  // 表头即时过滤(title + preview 子串,大小写不敏感)。
  const [filter, setFilter] = useState("");
  // 行右键菜单:坐标 + 目标节点 + 复制反馈。
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [menuNode, setMenuNode] = useState<NodeOut | null>(null);
  const [copied, setCopied] = useState(false);

  const nodes = useMemo(() => {
    const all = snapshot?.nodes ?? [];
    if (!navSelection) return all;
    return filterByNav(all, navSelection);
  }, [snapshot, navSelection]);

  // 按 modified 倒序(最近改的在上);缺失 mtime 视为 0 排末尾。
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => (b.modified || 0) - (a.modified || 0)),
    [nodes],
  );

  // 表头过滤:title + preview 子串(空串 = 不过滤,返回全量)。
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => {
      const title = (n.title || n.path).toLowerCase();
      return title.includes(q) || (n.preview ?? "").toLowerCase().includes(q);
    });
  }, [sorted, filter]);

  const now = Date.now();

  // 过滤框 placeholder 的 scope 描述(当前 Nav 选择;复用 selectionLabel)。
  const scopeLabel = useMemo(
    () => (navSelection ? selectionLabel(navSelection, t) : t("nav.allNotes")),
    [navSelection, t],
  );

  const emptyKey = (() => {
    const k = navSelection?.kind ?? "all";
    return `list.empty.${k}`;
  })();

  // archive:委派给 ArchiveView(删除/还原并入 git,组件内自取数)。
  // 放在所有 hook 之后,保证 hook 调用数与选择类型无关。
  if (navSelection?.kind === "archive") {
    return <ArchiveView root={root} actions={actions} t={t} />;
  }

  /** 右键菜单项(扁平,组分隔)。status 当前值标 ✓;Reveal 仅桌面显示。 */
  const menuItems: MenuItem[] = menuNode
    ? buildMenuItems(menuNode, {
        t,
        root,
        onStartRename,
        actions,
        currentStatus: menuNode.status,
        onCopied: () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        },
      })
    : [];

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-crust bg-mantle px-2 py-1.5">
        <MagnifyingGlass size={12} className="shrink-0 text-overlay" />
        <input
          data-testid="list-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("list.filterPlaceholder", { scope: scopeLabel })}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-overlay"
        />
        <span className="ml-1 shrink-0 text-[11px] tabular-nums text-overlay">
          {filtered.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-overlay">
          {filter.trim() ? t("palette.empty") : t(emptyKey)}
        </p>
      ) : (
        <ul className="flex flex-col">
          {filtered.map((n) => {
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
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-open-llm-wiki-note", n.path);
                    e.dataTransfer.setData("text/plain", n.path);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => actions.selectNote(n.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuPos({ x: e.clientX, y: e.clientY });
                    setMenuNode(n);
                  }}
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
                        {labelStatus(n.status, t)}
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

      <ContextMenu items={menuItems} pos={menuPos} onClose={() => setMenuPos(null)} />
      {copied && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-surface px-3 py-1 text-[12px] text-text shadow-lg">
          {t("menu.copied")}
        </div>
      )}
    </div>
  );
}

/** 构造右键菜单项(扁平 + 分隔符);status 当前值前标 ✓;Reveal 仅非 mock 桌面显示。 */
function buildMenuItems(
  n: NodeOut,
  ctx: {
    t: TFunc;
    root: string | null;
    onStartRename: (path: string) => void;
    actions: VaultActions;
    currentStatus: string | null;
    onCopied: () => void;
  },
): MenuItem[] {
  const { t, root, onStartRename, actions, currentStatus, onCopied } = ctx;
  const title = n.title || n.path.split("/").pop()?.replace(/\.md$/i, "") || n.path;
  const items: MenuItem[] = [
    {
      label: t("menu.rename"),
      onClick: () => onStartRename(n.path),
    },
    {
      label: t("menu.copyWikilink"),
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(asWikilink(title));
          onCopied();
        } catch {
          // 剪贴板被禁用时静默(无 https / 权限);复制反馈亦不显示。
        }
      },
    },
    { separator: true },
  ];
  // status 预设:当前值标 ✓。
  for (const s of STATUS_PRESETS) {
    items.push({
      label: `${currentStatus === s ? "✓ " : ""}${labelStatus(s, t)}`,
      onClick: () => void actions.setNoteStatus(n.path, s),
    });
  }
  items.push({
    label: t("menu.clearStatus"),
    disabled: !currentStatus,
    onClick: () => void actions.setNoteStatus(n.path, null),
  });
  items.push({ separator: true });
  // 删除文件:直接 deleteNote(git 归档,可从「归档」还原);无二次确认。
  items.push({
    label: t("menu.deleteFile"),
    onClick: () => void actions.deleteNote(n.path),
  });
  // Reveal in Finder:仅桌面(mock 无 fs,隐藏,与 GitPanel 同 gate)。
  if (!ipc.isMock()) {
    items.push({
      label: t("menu.reveal"),
      onClick: () => {
        if (root) void ipc.revealInFinder(root, n.path);
      },
    });
  }
  return items;
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
      data-testid="rename-input"
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
