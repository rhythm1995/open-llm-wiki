/**
 * Nav —— 左栏导航(Tolaria 式:智能视图 + 可折叠分组)。
 *
 * 两层结构:第一层 = 分组标题行(可折叠),第二层 = 组内条目。
 *   - 智能视图(无标题,顶部平铺):Inbox / All Notes / Archive,各带计数。
 *   - ▼ VIEWS:已保存的 QQL 查询(`type: Query` 笔记);点击 → List 运行该查询。
 *   - ▼ TYPES:`type` 去重 + 计数(动态);未分类(type 缺失)单列一行。
 *   - ▼ FOLDERS:目录树(复用 buildTree,只列目录;文件由中间 List 呈现)。
 *
 * 选择模型:点击设 `navSelection`(见 nav-filter.ts),中间 List 据它过滤。
 * Archive 也走同一模型(`{kind:"archive"}`)——点击后中间 List 委派给 ArchiveView:
 * 已删笔记列表(从 git 历史还原)+ 最近提交时间线。删除/还原已并入 git,无 `.trash/`。
 *
 * 本组件只渲染导航主体(无头部):vault 名 / 新建 / 打开已上移到 CenterToolbar 的
 * 「列表列表头」单元;面板显隐也由 CenterToolbar 的 Xcode 式切换簇统一控制。
 */
import { useMemo, useState } from "react";
import {
  Archive,
  CaretDown,
  CaretRight,
  Copy,
  Folder,
  FolderOpen,
  Funnel,
  Hash,
  NoteBlank,
  Plus,
  Tag,
  Tray,
} from "@phosphor-icons/react";
import type { VaultEntry, VaultSnapshot } from "../lib/ipc";
import { isInbox, sameSelection, type NavSelection } from "../lib/nav-filter";
import { isQueryNode } from "../lib/saved-query";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

/** 扁平 VaultEntry[] → 嵌套目录树(与旧 Sidebar 同;此处只渲染目录节点)。 */
function buildTree(entries: VaultEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: new Map() };
  for (const e of entries) {
    const parts = e.path.split("/");
    let cur = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isDir = isLast ? e.is_dir : true;
      if (!cur.children.has(part)) {
        cur.children.set(part, { name: part, path: acc, isDir, children: new Map() });
      }
      cur = cur.children.get(part)!;
    }
  }
  return root;
}

interface Props {
  entries: VaultEntry[];
  snapshot: VaultSnapshot | null;
  navSelection: NavSelection | null;
  onNavSelect: (sel: NavSelection) => void;
  /** 当前是否为 editor 视图。非 editor(图谱/搜索/git/查询)时,Nav 不高亮任何项——
   *  navSelection 此时仅是"上次列表过滤",与当前视图无关,高亮会误导(任务2)。 */
  isEditorView: boolean;
  /** 笔记拖到文件夹时回调(fromPath, targetDir;空串=根)。 */
  onMoveNote?: (fromPath: string, targetDir: string) => void;
  /** 在指定文件夹(相对 vault 路径)新建笔记;空串=根。 */
  onNewNoteInFolder?: (folderPath: string) => void;
  t: TFunc;
}

const NOTE_DRAG_MIME = "application/x-openobs-note";

export function Nav({
  entries,
  snapshot,
  navSelection,
  onNavSelect,
  isEditorView,
  onMoveNote,
  onNewNoteInFolder,
  t,
}: Props) {
  // 分组折叠状态:VIEWS/TYPES/TAGS 默认展开,FOLDERS 默认收起。
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["views", "types", "tags"]),
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderMenu, setFolderMenu] = useState<{
    path: string;
    x: number;
    y: number;
  } | null>(null);
  const nodes = snapshot?.nodes ?? [];

  const folderMenuItems: MenuItem[] = useMemo(() => {
    if (!folderMenu) return [];
    const path = folderMenu.path;
    return [
      {
        label: t("nav.menu.newNoteHere"),
        icon: <Plus size={13} />,
        onClick: () => onNewNoteInFolder?.(path),
        disabled: !onNewNoteInFolder,
      },
      {
        label: t("nav.menu.copyPath"),
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard?.writeText(path);
        },
      },
    ];
  }, [folderMenu, onNewNoteInFolder, t]);

  const inboxCount = useMemo(() => nodes.filter(isInbox).length, [nodes]);
  const queries = useMemo(() => nodes.filter(isQueryNode), [nodes]);
  // type 去重 + 计数;typed 升序,未分类("")排末尾。
  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.type ?? "", (m.get(n.type ?? "") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => {
      if (a[0] === "") return 1;
      if (b[0] === "") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [nodes]);
  // 标签去重 + 计数(F-TAGS 视图入口)。
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) for (const tg of n.tags) m.set(tg, (m.get(tg) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [nodes]);
  const tree = useMemo(() => buildTree(entries), [entries]);

  const acceptNoteDrop = (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const from = e.dataTransfer.getData(NOTE_DRAG_MIME) || e.dataTransfer.getData("text/plain");
    if (!from || !onMoveNote) return;
    onMoveNote(from, targetDir);
  };

  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleFolder = (path: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // ─── 行渲染器 ───────────────────────────────────────────────────────
  const countBadge = (n: number) => (
    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-overlay">{n}</span>
  );

  /** 智能视图 / type / query 行:点击设 navSelection。 */
  const itemRow = (
    sel: NavSelection,
    icon: React.ReactNode,
    label: string,
    active: boolean,
    count?: number,
  ) => (
    <button
      onClick={() => onNavSelect(sel)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px]",
        active ? "bg-surface2 text-text" : "text-subtext hover:bg-surface hover:text-text",
      )}
    >
      <span className="shrink-0 text-overlay">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && countBadge(count)}
    </button>
  );

  /** 分组标题行(第一层):caret 折叠 + 图标 + 标题。 */
  const sectionHeader = (key: string, icon: React.ReactNode, label: string, count?: number) => {
    const open = openSections.has(key);
    return (
      <button
        onClick={() => toggleSection(key)}
        className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-overlay hover:text-subtext"
      >
        {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto shrink-0 tabular-nums">{count}</span>
        )}
      </button>
    );
  };

  /** 目录节点(第二层):caret 折叠,余下行点击 = 选中该文件夹(过滤 List)。 */
  const renderFolder = (node: TreeNode, depth: number): React.ReactNode => {
    if (!node.isDir) return null; // FOLDERS 只列目录;文件由 List 呈现。
    const kids = [...node.children.values()]
      .filter((k) => k.isDir)
      .sort((a, b) => a.name.localeCompare(b.name));
    // 根外壳不渲染;直接平铺顶层目录。
    if (node.path === "") {
      return (
        <div key="root">{kids.map((k) => renderFolder(k, depth))}</div>
      );
    }
    const open = expandedFolders.has(node.path);
    const active = isEditorView && sameSelection(navSelection, { kind: "folder", id: node.path });
    const dropping = dropTarget === node.path;
    return (
      <div key={node.path}>
        <div
          className={cn(
            "group flex w-full items-center gap-1 rounded pr-1 text-left text-[13px]",
            active ? "bg-surface2 text-text" : "text-subtext hover:bg-surface hover:text-text",
            dropping && "ring-1 ring-blue bg-blue/10",
          )}
          style={{ paddingLeft: depth * 12 + 4 }}
          onContextMenu={(e) => {
            e.preventDefault();
            setFolderMenu({ path: node.path, x: e.clientX, y: e.clientY });
          }}
          onDragOver={(e) => {
            if (!onMoveNote) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(node.path);
          }}
          onDragLeave={() => setDropTarget((cur) => (cur === node.path ? null : cur))}
          onDrop={(e) => acceptNoteDrop(e, node.path)}
        >
          <button
            onClick={() => toggleFolder(node.path)}
            className="shrink-0 rounded p-0.5 text-overlay hover:text-text"
            tabIndex={-1}
            aria-label={open ? t("nav.section.folders") : t("nav.section.folders")}
          >
            {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
          </button>
          <button
            onClick={() => onNavSelect({ kind: "folder", id: node.path })}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1"
          >
            {open ? (
              <FolderOpen size={14} className="shrink-0 text-yellow" weight="fill" />
            ) : (
              <Folder size={14} className="shrink-0 text-yellow" weight="fill" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
        </div>
        {open && kids.map((k) => renderFolder(k, depth + 1))}
      </div>
    );
  };

  const hasVault = snapshot !== null;

  return (
    <div className="flex h-full flex-col bg-mantle">
      {!hasVault ? (
        <p className="px-3 py-4 text-[12px] text-overlay">{t("sidebar.empty")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          {/* 智能视图(无分组标题,顶部平铺)。Archive 特例:委派给 ArchiveView(git 历史)。 */}
          <div className="flex flex-col gap-0.5">
            {itemRow(
              { kind: "inbox" },
              <Tray size={14} />,
              t("nav.inbox"),
              isEditorView && sameSelection(navSelection, { kind: "inbox" }),
              inboxCount,
            )}
            {itemRow(
              { kind: "all" },
              <NoteBlank size={14} />,
              t("nav.allNotes"),
              isEditorView && sameSelection(navSelection, { kind: "all" }),
              nodes.length,
            )}
            <button
              data-testid="nav-archive"
              onClick={() => onNavSelect({ kind: "archive" })}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px]",
                isEditorView && sameSelection(navSelection, { kind: "archive" })
                  ? "bg-surface2 text-text"
                  : "text-subtext hover:bg-surface hover:text-text",
              )}
            >
              <Archive size={14} className="shrink-0 text-overlay" />
              <span className="min-w-0 flex-1 truncate">{t("nav.archive")}</span>
            </button>
          </div>

          <div className="my-2 border-t border-crust" />

          {/* ▼ VIEWS:已保存 QQL 查询。用户可自建;不写死 Contested/Orphan/Stale。 */}
          {sectionHeader("views", <Funnel size={12} />, t("nav.section.views"), queries.length)}
          {openSections.has("views") && (
            <div className="mb-1 mt-0.5 flex flex-col gap-0.5">
              {queries.length === 0 ? (
                <p className="px-2 py-1 text-[12px] text-overlay">{t("nav.views.empty")}</p>
              ) : (
                queries.map((q) =>
                  itemRow(
                    { kind: "query", id: q.path },
                    <Funnel size={13} />,
                    q.title || q.path,
                    isEditorView && sameSelection(navSelection, { kind: "query", id: q.path }),
                  ),
                )
              )}
            </div>
          )}

          {/* ▼ TYPES:type 去重 + 计数。 */}
          {sectionHeader("types", <Tag size={12} />, t("nav.section.types"), types.length)}
          {openSections.has("types") && (
            <div className="mb-1 mt-0.5 flex flex-col gap-0.5">
              {types.map(([id, count]) =>
                itemRow(
                  { kind: "type", id },
                  <Tag size={13} />,
                  id === "" ? t("nav.untyped") : id,
                  isEditorView && sameSelection(navSelection, { kind: "type", id }),
                  count,
                ),
              )}
            </div>
          )}

          {/* ▼ TAGS:标签视图(F-TAGS)。 */}
          {sectionHeader("tags", <Hash size={12} />, t("nav.section.tags"), tags.length)}
          {openSections.has("tags") && (
            <div className="mb-1 mt-0.5 flex flex-col gap-0.5">
              {tags.length === 0 ? (
                <p className="px-2 py-1 text-[12px] text-overlay">{t("nav.tags.empty")}</p>
              ) : (
                tags.map(([id, count]) =>
                  itemRow(
                    { kind: "tag", id },
                    <Hash size={13} />,
                    `#${id}`,
                    isEditorView && sameSelection(navSelection, { kind: "tag", id }),
                    count,
                  ),
                )
              )}
            </div>
          )}

          {/* ▼ FOLDERS:目录树(默认收起);可接受列表拖放。 */}
          {sectionHeader("folders", <Folder size={12} weight="fill" />, t("nav.section.folders"))}
          {openSections.has("folders") && (
            <div className="mt-0.5">
              {/* 根目录放置区:把笔记拖回 vault 根。 */}
              {onMoveNote && (
                <div
                  className={cn(
                    "mb-0.5 rounded px-2 py-1 text-[12px] text-overlay",
                    dropTarget === "" ? "bg-blue/10 ring-1 ring-blue text-text" : "hover:bg-surface",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget("");
                  }}
                  onDragLeave={() => setDropTarget((cur) => (cur === "" ? null : cur))}
                  onDrop={(e) => acceptNoteDrop(e, "")}
                >
                  {t("nav.dropToRoot")}
                </div>
              )}
              {entries.length === 0 ? (
                <p className="px-2 py-1 text-[12px] text-overlay">{t("sidebar.empty")}</p>
              ) : (
                renderFolder(tree, 0)
              )}
            </div>
          )}
        </div>
      )}
      <ContextMenu
        items={folderMenuItems}
        pos={folderMenu ? { x: folderMenu.x, y: folderMenu.y } : null}
        onClose={() => setFolderMenu(null)}
      />
    </div>
  );
}
