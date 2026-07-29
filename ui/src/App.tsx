/**
 * App —— OpenObsidian 主壳。
 *
 * 三栏布局(参考 Obsidian / Tolaria):
 *   左:Sidebar(文件树)  中:主视图(编辑器/图谱/QQL/搜索)  右:Inspector(反链/属性)
 * 顶 Toolbar 切换主视图;底 StatusBar 显示保存状态。
 *
 * ⌘K 唤起命令面板。mock 模式下首挂载自动打开种子 vault,浏览器即开即用。
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Warning, X, Code, PencilSimple } from "@phosphor-icons/react";
import { Nav } from "./components/Nav";
import { NoteListView } from "./components/NoteListView";
import type { NavSelection } from "./lib/nav-filter";
import { selectionLabel } from "./lib/nav-filter";
import { Editor, type EditorHandle } from "./components/Editor";
import { WysiwygView } from "./components/WysiwygView";
import { TabBar } from "./components/TabBar";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { QueryPanel } from "./components/QueryPanel";
import { SearchPanel } from "./components/SearchPanel";
import { GitPanel } from "./components/GitPanel";
import { CommandPalette, type MainView } from "./components/CommandPalette";
import { CenterToolbar } from "./components/CenterToolbar";
import { StatusBar } from "./components/StatusBar";
import { useVault } from "./lib/store";
import { useTheme } from "./lib/useTheme";
import { useLocale } from "./lib/useLocale";
import { usePersistentState } from "./lib/usePersistentState";
import { ipc } from "./lib/ipc";
import { resolveWikiTarget } from "./lib/wikilink";
import { isCanvasPath } from "./lib/canvas";
import { writeLastPath, readLastRoot, clearLastRoot } from "./lib/last-note";

// 画布视图懒加载:tldraw 是重依赖 + 非商用许可,隔离到独立 chunk(见 THIRD_PARTY_NOTICES)。
// 不开画布就不下载 tldraw;许可边界也随之收束在 CanvasView 这一个模块里。
const CanvasView = lazy(() =>
  import("./components/CanvasView").then((m) => ({ default: m.CanvasView })),
);

export default function App() {
  const { state, currentNode, backlinks, navInfo, actions } = useVault();
  // 上次的主视图 / 编辑·阅读模式持久化到 localStorage,重启后恢复(与 useTheme/useLocale 同构)。
  const [view, setView] = usePersistentState<MainView>("openobs.view", "editor");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, toggle: toggleLocale, t } = useLocale();
  const editorRef = useRef<EditorHandle>(null);
  // 双模式:source(CodeMirror 源码)/ wysiwyg(BlockNote 所见即所得)。两者读写同一
  // state.content(.md 真相源)。旧值 "edit"|"read" 归一到新值(非 "wysiwyg" 一律视为
  // "source"),localStorage 旧值无痛迁移。
  const [editModeRaw, setEditMode] = usePersistentState<string>(
    "openobs.editMode",
    "source",
  );
  const editMode: "source" | "wysiwyg" =
    editModeRaw === "wysiwyg" ? "wysiwyg" : "source";
  // 四区布局:三个非编辑器面板各自可隐藏,状态持久化。切换入口集中在 CenterToolbar
  // 右侧的 Xcode 式切换簇(面板边缘不放按钮)。编辑器常驻,不参与切换。
  const [navOpen, setNavOpen] = usePersistentState("openobs.navOpen", true);
  const [listOpen, setListOpen] = usePersistentState("openobs.listOpen", true);
  const [propsOpen, setPropsOpen] = usePersistentState(
    "openobs.propsOpen",
    true,
  );
  // Nav 选择模型:中间 List 据它过滤。默认"全部笔记"。
  const [navSelection, setNavSelection] = useState<NavSelection | null>({
    kind: "all",
  });
  // 当前页是否为 tldraw 画布(.canvas):是则中栏渲染 CanvasView,隐藏编辑/阅读切换与属性面板。
  const isCanvas = state.currentPath !== null && isCanvasPath(state.currentPath);
  // vault 显示名(顶栏列表表头与无 vault 入口共用)。
  const vaultName = state.root
    ? state.root.replace(/\/+$/, "").split("/").pop() || state.root
    : null;
  const hasVault = vaultName !== null;
  // 列表列 / 属性列是否随当前视图渲染(驱动 CenterToolbar 对应表头单元显隐,
  // 使顶栏分隔线与下方内容列贯穿对齐)。
  // 第二栏(列表)独立于第三栏视图:切图谱/git/搜索/查询时列表保留,只第三栏内容换。
  // 除非用户本就关了列表(listOpen=false)。——任务4:视图切换不再吞掉第二栏。
  const showList = listOpen && hasVault;
  const showProps = propsOpen && view === "editor" && !isCanvas;

  // 顶栏居中标签:editor 视图取当前 Nav 选择(全部笔记/收件箱/某类型/…);
  // 其余视图取视图名(图谱/查询/搜索/Git)。App 端算好,CenterToolbar 只渲染。
  const contextLabel = useMemo(() => {
    if (view !== "editor") return t(`view.${view}`);
    const nodes = state.snapshot?.nodes ?? [];
    return navSelection ? selectionLabel(navSelection, nodes, t) : t("nav.allNotes");
  }, [view, navSelection, state.snapshot, t]);

  /** `[[wikilink]]` 跟随:解析为路径则跳转,否则提示新建(编辑器与阅读视图共用)。 */
  const handleFollow = useCallback(
    (target: string) => {
      const path = resolveWikiTarget(target, state.snapshot?.nodes ?? []);
      if (path) {
        actions.selectNote(path);
      } else if (window.confirm(t("app.unresolvedConfirm", { target }))) {
        void actions.createNote(target);
      }
    },
    [actions, state.snapshot],
  );

  /** 新建画布(F-CANVAS):询问名称后建一个空白 `.canvas`。 */
  const handleNewCanvas = useCallback(() => {
    const name = window.prompt(t("canvas.namePrompt"), "whiteboard");
    if (name && name.trim()) void actions.createCanvas(name.trim());
  }, [actions, t]);

  /**
   * 新建笔记入口(任务3:inline,不弹窗):有 vault 时建一篇草稿(默认模板
   * frontmatter)+ 进列表行 inline 重命名态;无 vault 时唤起选择器(不静默 no-op)。
   */
  const openNewNote = useCallback(() => {
    if (!state.root) {
      void actions.openPicker();
      return;
    }
    void actions.createDraftNote(t("newNote.untitled")).then((p) => {
      if (p) setRenamingPath(p);
    });
  }, [state.root, actions, t]);

  /** inline 重命名提交(任务3):sanitize 输入为文件名(去非法字符),空值回退 untitled;
   *  commitDraftRename 会 rename 文件名 + 同步草稿 H1 标题(标题=文件名)。Esc 取消。 */
  const commitRename = useCallback(
    (path: string, value: string) => {
      setRenamingPath(null);
      const cleaned = value
        .replace(/[/\\:*?"<>|]/g, " ")
        .replace(/\.md$/i, "")
        .trim();
      void actions.commitDraftRename(path, cleaned || t("newNote.untitled"));
    },
    [actions, t],
  );
  const cancelRename = useCallback(() => setRenamingPath(null), []);
  const openNewCanvas = useCallback(() => {
    if (state.root) handleNewCanvas();
    else void actions.openPicker();
  }, [state.root, actions, handleNewCanvas]);

  /**
   * 选中某 Nav 项(智能视图含 Archive / type / folder / query):设 navSelection **并
   * 切回 editor 视图**——List 只在 editor 视图渲染,任何 Nav 选择都意味着"我要看笔记"。
   * Archive 也走此路径({kind:"archive"}):NoteListView 据此委派给 ArchiveView,渲染
   * 已删笔记列表(从 git 历史还原)+ 最近提交时间线。删除/还原已并入 git,无 `.trash/`。
   */
  const handleNavSelect = useCallback((sel: NavSelection) => {
    setNavSelection(sel);
    setView("editor");
  }, []);

  // mock:打开种子 vault;Tauri:恢复上次打开的 vault(无则留空态,等用户点「打开」)。
  useEffect(() => {
    if (ipc.isMock()) {
      void actions.openVault("/mock-vault");
      return;
    }
    const last = readLastRoot();
    if (last) {
      void (async () => {
        // 目录已不存在等失败:清掉记录,下次走空态,不反复撞坏路径。
        const ok = await actions.openVault(last);
        if (!ok) clearLastRoot();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘K 命令面板 / ⌘P·⌘O 快速打开笔记(三种键位都唤起同一面板)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && /^[kpo]$/.test(e.key.toLowerCase())) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ⌘S / Ctrl+S 立即保存(拦截浏览器的"保存网页")。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void actions.saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions.saveNow]);

  // ⌘W / Ctrl+W 关闭当前标签(编辑器视图、有当前笔记、且无对话框/面板遮挡时)。
  // 注:浏览器 dev 下 ⌘W 会被浏览器抢占关闭页签,仅在 Tauri 桌面 app 生效(见 deferred)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
        if (view !== "editor" || !state.currentPath || paletteOpen) return;
        e.preventDefault();
        actions.closeTab(state.currentPath);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, state.currentPath, paletteOpen, actions.closeTab]);

  // 标签循环切换:Ctrl+Tab/Ctrl+Shift+Tab、⌘/Ctrl+Shift+[ 与 ]、⌘/Ctrl+PageUp/PageDown。
  // 注:Ctrl+Tab 在浏览器 dev 里被浏览器抢占(preventDefault 无效),仅在 Tauri 桌面 app 生效;
  // ⌘Shift+[] 与 PageUp/Down 在桌面 webview 内可用。见 deferred「标签循环快捷键」。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "editor" || paletteOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      let dir: 1 | -1 | null = null;
      if (e.ctrlKey && e.key === "Tab") dir = e.shiftKey ? -1 : 1;
      else if (e.shiftKey && e.key === "[") dir = -1;
      else if (e.shiftKey && e.key === "]") dir = 1;
      else if (e.key === "PageUp") dir = -1;
      else if (e.key === "PageDown") dir = 1;
      if (dir == null) return;
      e.preventDefault();
      void actions.cycleTab(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, paletteOpen, actions.cycleTab]);

  // 记下当前笔记,下次打开同 vault 时恢复(按 root 分键;恢复逻辑在 openVault 里)。
  useEffect(() => {
    if (!state.root || !state.currentPath) return;
    writeLastPath(state.root, state.currentPath);
  }, [state.root, state.currentPath]);

  return (
    <div className="flex h-screen flex-col">
      {/* 全宽顶栏(Tolaria 式):视图切换 + Xcode 式面板切换簇,横跨四区、穿透列间分隔线。
          透明标题栏(Overlay)下,它也是窗口拖拽区(内部留出 macOS 交通灯空间,见 CenterToolbar)。 */}
      <CenterToolbar
        view={view}
        onNavigate={setView}
        onOpenPalette={() => setPaletteOpen(true)}
        t={t}
        contextLabel={contextLabel}
        canBack={navInfo.canBack}
        canForward={navInfo.canForward}
        onBack={() => void actions.goBack()}
        onForward={() => void actions.goForward()}
        navOpen={navOpen}
        listOpen={listOpen}
        propsOpen={propsOpen}
        onToggleNav={() => setNavOpen((v) => !v)}
        onToggleList={() => setListOpen((v) => !v)}
        onToggleProps={() => setPropsOpen((v) => !v)}
        showList={showList}
        showProps={showProps}
        vaultName={vaultName}
        onNewNote={openNewNote}
        onNewCanvas={openNewCanvas}
        onOpenVault={() => void actions.openPicker()}
      />
      {state.error && (
        <div className="flex items-center gap-2 border-b border-red/40 bg-red/10 px-3 py-1.5 text-[12px] text-red">
          <Warning size={14} weight="bold" className="shrink-0" />
          <pre className="min-w-0 flex-1 truncate font-sans">{state.error}</pre>
          <button
            onClick={actions.clearError}
            className="shrink-0 rounded p-0.5 hover:bg-red/20"
            title={t("common.close")}
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* 区 1:导航(可隐藏)。智能视图 + VIEWS/TYPES/FOLDERS 分组。 */}
        {navOpen && (
          <div className="w-56 shrink-0 border-r border-crust">
            <Nav
              entries={state.entries}
              snapshot={state.snapshot}
              navSelection={navSelection}
              onNavSelect={handleNavSelect}
              isEditorView={view === "editor"}
              t={t}
            />
          </div>
        )}

        {/* 区 2:列表(可隐藏,仅 editor 视图)。据 navSelection 过滤;点行 → 编辑器。 */}
        {showList && (
          <div
            data-testid="note-list"
            className="w-80 shrink-0 overflow-y-auto border-r border-crust bg-base"
          >
            <NoteListView
              root={state.root}
              snapshot={state.snapshot}
              currentPath={state.currentPath}
              navSelection={navSelection}
              renamingPath={renamingPath}
              onRenameCommit={commitRename}
              onRenameCancel={cancelRename}
              actions={actions}
              t={t}
            />
          </div>
        )}

        {/* 区 3:编辑器(常驻,不参与切换)。主视图内容(CenterToolbar 已提到全宽顶栏)。 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 min-w-0">
            {view === "editor" && (
              <div className="flex h-full flex-col">
                <TabBar
                  openPaths={state.openPaths}
                  activePath={state.currentPath}
                  snapshot={state.snapshot}
                  actions={actions}
                  t={t}
                />
                <div className="relative min-h-0 flex-1">
                  {isCanvas ? (
                    <Suspense
                      fallback={
                        <div className="flex h-full items-center justify-center text-[13px] text-overlay">
                          {t("canvas.loading")}
                        </div>
                      }
                    >
                      <CanvasView
                        key={state.currentPath}
                        content={state.content}
                        onSave={actions.setContent}
                        t={t}
                      />
                    </Suspense>
                  ) : editMode === "source" ? (
                    <Editor
                      ref={editorRef}
                      value={state.content}
                      onChange={actions.setContent}
                      hasNote={state.currentPath !== null}
                      theme={theme}
                      noteTitles={state.snapshot?.nodes.map((n) => n.title) ?? []}
                      root={state.root}
                      onFollow={handleFollow}
                      t={t}
                    />
                  ) : (
                    <WysiwygView
                      key={state.currentPath ?? "empty"}
                      content={state.content}
                      onChange={actions.setContent}
                      hasNote={state.currentPath !== null}
                      theme={theme}
                      t={t}
                    />
                  )}
                  {!isCanvas && state.currentPath !== null && (
                    <button
                      onClick={() =>
                        setEditMode(editMode === "source" ? "wysiwyg" : "source")
                      }
                      className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-surface/80 px-2 py-1 text-[12px] text-subtext hover:bg-surface2"
                      title={
                        editMode === "source"
                          ? t("editor.toWysiwyg")
                          : t("editor.toSource")
                      }
                    >
                      {editMode === "source" ? (
                        <PencilSimple size={14} />
                      ) : (
                        <Code size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
            {view === "graph" && (
              <GraphView
                snapshot={state.snapshot}
                currentId={currentNode?.id ?? null}
                actions={actions}
                t={t}
              />
            )}
            {view === "query" && (
              <QueryPanel
                root={state.root}
                snapshot={state.snapshot}
                actions={actions}
                t={t}
              />
            )}
            {view === "search" && (
              <SearchPanel
                root={state.root}
                snapshot={state.snapshot}
                actions={actions}
                t={t}
              />
            )}
            {view === "git" && <GitPanel root={state.root} t={t} />}
          </div>
        </div>

        {/* 区 4:属性(可隐藏,仅 editor 视图且非画布)。Inspector 暂不动内部结构。 */}
        {showProps && (
          <div className="w-[280px] shrink-0 border-l border-crust">
            <Inspector
              node={currentNode}
              content={state.content}
              backlinks={backlinks}
              actions={actions}
              onJumpToLine={(line) => editorRef.current?.scrollToLine(line)}
              t={t}
            />
          </div>
        )}
      </div>

      <StatusBar
        state={state}
        theme={theme}
        onToggleTheme={toggleTheme}
        locale={locale}
        onToggleLocale={toggleLocale}
        t={t}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        snapshot={state.snapshot}
        actions={actions}
        onNewNote={openNewNote}
        onNewCanvas={openNewCanvas}
        onNavigate={(v) => {
          setView(v);
        }}
        t={t}
      />
    </div>
  );
}
