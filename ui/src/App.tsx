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
import { Warning, X, Eye, PencilSimple } from "@phosphor-icons/react";
import { Sidebar } from "./components/Sidebar";
import { Editor, type EditorHandle } from "./components/Editor";
import { ReadingView } from "./components/ReadingView";
import { TabBar } from "./components/TabBar";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { QueryPanel } from "./components/QueryPanel";
import { SearchPanel } from "./components/SearchPanel";
import { TrashPanel } from "./components/TrashPanel";
import { GitPanel } from "./components/GitPanel";
import { NewNoteDialog, type TemplateOption } from "./components/NewNoteDialog";
import { CommandPalette, type MainView } from "./components/CommandPalette";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { useVault } from "./lib/store";
import { useTheme } from "./lib/useTheme";
import { useLocale } from "./lib/useLocale";
import { usePersistentState } from "./lib/usePersistentState";
import { ipc } from "./lib/ipc";
import { resolveWikiTarget } from "./lib/wikilink";
import { isTemplatePath, templateName } from "./lib/template";
import { isCanvasPath } from "./lib/canvas";

// 画布视图懒加载:tldraw 是重依赖 + 非商用许可,隔离到独立 chunk(见 THIRD_PARTY_NOTICES)。
// 不开画布就不下载 tldraw;许可边界也随之收束在 CanvasView 这一个模块里。
const CanvasView = lazy(() =>
  import("./components/CanvasView").then((m) => ({ default: m.CanvasView })),
);

export default function App() {
  const { state, currentNode, backlinks, actions } = useVault();
  // 上次的主视图 / 编辑·阅读模式持久化到 localStorage,重启后恢复(与 useTheme/useLocale 同构)。
  const [view, setView] = usePersistentState<MainView>("openobs.view", "editor");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, toggle: toggleLocale, t } = useLocale();
  const editorRef = useRef<EditorHandle>(null);
  const [editMode, setEditMode] = usePersistentState<"edit" | "read">(
    "openobs.editMode",
    "edit",
  );
  // 当前页是否为 tldraw 画布(.canvas):是则中栏渲染 CanvasView,隐藏编辑/阅读切换与属性面板。
  const isCanvas = state.currentPath !== null && isCanvasPath(state.currentPath);

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

  // vault 的 templates/ 目录即模板候选(客户端过滤,无需后端特例)。
  const templates = useMemo<TemplateOption[]>(
    () =>
      state.entries
        .filter((e) => !e.is_dir && isTemplatePath(e.path))
        .map((e) => ({ path: e.path, name: templateName(e.path) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.entries],
  );

  // mock 模式:首挂载即打开种子 vault,浏览器开箱可看。
  useEffect(() => {
    if (ipc.isMock()) void actions.openVault("/mock-vault");
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
        if (
          view !== "editor" ||
          !state.currentPath ||
          paletteOpen ||
          newNoteOpen
        )
          return;
        e.preventDefault();
        actions.closeTab(state.currentPath);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, state.currentPath, paletteOpen, newNoteOpen, actions.closeTab]);

  return (
    <div className="flex h-screen flex-col">
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
      <Toolbar
        view={view}
        onNavigate={setView}
        onOpenPalette={() => setPaletteOpen(true)}
        actions={actions}
        theme={theme}
        onToggleTheme={toggleTheme}
        locale={locale}
        onToggleLocale={toggleLocale}
        t={t}
      />
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0">
          <Sidebar
            entries={state.entries}
            currentPath={state.currentPath}
            actions={actions}
            onNewNote={() => setNewNoteOpen(true)}
            onNewCanvas={handleNewCanvas}
            t={t}
          />
        </div>

        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
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
                  ) : editMode === "edit" ? (
                    <Editor
                      ref={editorRef}
                      value={state.content}
                      onChange={actions.setContent}
                      hasNote={state.currentPath !== null}
                      theme={theme}
                      noteTitles={state.snapshot?.nodes.map((n) => n.title) ?? []}
                      onFollow={handleFollow}
                      t={t}
                    />
                  ) : (
                    <ReadingView
                      content={state.content}
                      hasNote={state.currentPath !== null}
                      onFollow={handleFollow}
                      t={t}
                    />
                  )}
                  {!isCanvas && state.currentPath !== null && (
                    <button
                      onClick={() =>
                        setEditMode((m) => (m === "edit" ? "read" : "edit"))
                      }
                      className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-surface/80 px-2 py-1 text-[12px] text-subtext hover:bg-surface2"
                      title={
                        editMode === "edit" ? t("editor.toRead") : t("editor.toEdit")
                      }
                    >
                      {editMode === "edit" ? (
                        <Eye size={14} />
                      ) : (
                        <PencilSimple size={14} />
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
            {view === "trash" && (
              <TrashPanel trash={state.trash} actions={actions} t={t} />
            )}
            {view === "git" && <GitPanel root={state.root} t={t} />}
          </div>

          {view === "editor" && !isCanvas && (
            <div className="w-64 shrink-0 border-l border-crust">
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
      </div>

      <StatusBar state={state} t={t} />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        snapshot={state.snapshot}
        actions={actions}
        onNewNote={() => setNewNoteOpen(true)}
        onNewCanvas={handleNewCanvas}
        onNavigate={(v) => {
          setView(v);
        }}
        t={t}
      />

      <NewNoteDialog
        open={newNoteOpen}
        onOpenChange={setNewNoteOpen}
        templates={templates}
        onCreate={(n, tpl) => void actions.createNoteFromTemplate(n, tpl)}
        t={t}
      />
    </div>
  );
}
