/**
 * App —— OpenObsidian 主壳。
 *
 * 三栏布局(参考 Obsidian / Tolaria):
 *   左:Sidebar(文件树)  中:主视图(编辑器/图谱/QQL/搜索)  右:Inspector(反链/属性)
 * 顶 Toolbar 切换主视图;底 StatusBar 显示保存状态。
 *
 * ⌘K 唤起命令面板。mock 模式下首挂载自动打开种子 vault,浏览器即开即用。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Warning, X } from "@phosphor-icons/react";
import { Sidebar } from "./components/Sidebar";
import { Editor, type EditorHandle } from "./components/Editor";
import { TabBar } from "./components/TabBar";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { QueryPanel } from "./components/QueryPanel";
import { SearchPanel } from "./components/SearchPanel";
import { TrashPanel } from "./components/TrashPanel";
import { NewNoteDialog, type TemplateOption } from "./components/NewNoteDialog";
import { CommandPalette, type MainView } from "./components/CommandPalette";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { useVault } from "./lib/store";
import { useTheme } from "./lib/useTheme";
import { ipc } from "./lib/ipc";
import { resolveWikiTarget } from "./lib/wikilink";
import { isTemplatePath, templateName } from "./lib/template";

export default function App() {
  const { state, currentNode, backlinks, actions } = useVault();
  const [view, setView] = useState<MainView>("editor");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const editorRef = useRef<EditorHandle>(null);

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

  return (
    <div className="flex h-screen flex-col">
      {state.error && (
        <div className="flex items-center gap-2 border-b border-red/40 bg-red/10 px-3 py-1.5 text-[12px] text-red">
          <Warning size={14} weight="bold" className="shrink-0" />
          <pre className="min-w-0 flex-1 truncate font-sans">{state.error}</pre>
          <button
            onClick={actions.clearError}
            className="shrink-0 rounded p-0.5 hover:bg-red/20"
            title="关闭"
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
      />
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0">
          <Sidebar
            entries={state.entries}
            currentPath={state.currentPath}
            actions={actions}
            onNewNote={() => setNewNoteOpen(true)}
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
                />
                <div className="min-h-0 flex-1">
                  <Editor
                    ref={editorRef}
                    value={state.content}
                    onChange={actions.setContent}
                    hasNote={state.currentPath !== null}
                    theme={theme}
                    noteTitles={state.snapshot?.nodes.map((n) => n.title) ?? []}
                    onFollow={(target) => {
                      const path = resolveWikiTarget(
                        target,
                        state.snapshot?.nodes ?? [],
                      );
                      if (path) {
                        actions.selectNote(path);
                      } else if (
                        window.confirm(`「${target}」尚不存在,是否新建?`)
                      ) {
                        void actions.createNote(target);
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {view === "graph" && (
              <GraphView
                snapshot={state.snapshot}
                currentId={currentNode?.id ?? null}
                actions={actions}
              />
            )}
            {view === "query" && (
              <QueryPanel
                root={state.root}
                snapshot={state.snapshot}
                actions={actions}
              />
            )}
            {view === "search" && (
              <SearchPanel
                root={state.root}
                snapshot={state.snapshot}
                actions={actions}
              />
            )}
            {view === "trash" && (
              <TrashPanel trash={state.trash} actions={actions} />
            )}
          </div>

          {view === "editor" && (
            <div className="w-64 shrink-0 border-l border-crust">
              <Inspector
                node={currentNode}
                content={state.content}
                backlinks={backlinks}
                actions={actions}
                onJumpToLine={(line) => editorRef.current?.scrollToLine(line)}
              />
            </div>
          )}
        </div>
      </div>

      <StatusBar state={state} />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        snapshot={state.snapshot}
        actions={actions}
        onNewNote={() => setNewNoteOpen(true)}
        onNavigate={(v) => {
          setView(v);
        }}
      />

      <NewNoteDialog
        open={newNoteOpen}
        onOpenChange={setNewNoteOpen}
        templates={templates}
        onCreate={(n, tpl) => void actions.createNoteFromTemplate(n, tpl)}
      />
    </div>
  );
}
