/**
 * App —— OpenObsidian 主壳。
 *
 * 三栏布局(参考 Obsidian / Tolaria):
 *   左:Sidebar(文件树)  中:主视图(编辑器/图谱/QQL/搜索)  右:Inspector(反链/属性)
 * 顶 Toolbar 切换主视图;底 StatusBar 显示保存状态。
 *
 * ⌘K 唤起命令面板。mock 模式下首挂载自动打开种子 vault,浏览器即开即用。
 */
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { Inspector } from "./components/Inspector";
import { GraphView } from "./components/GraphView";
import { QueryPanel } from "./components/QueryPanel";
import { SearchPanel } from "./components/SearchPanel";
import { CommandPalette, type MainView } from "./components/CommandPalette";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { useVault } from "./lib/store";
import { ipc } from "./lib/ipc";

/** 轻量 frontmatter 解析(仅展示用;语义以 core 为准)。 */
function parseFrontmatter(text: string): Record<string, unknown> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  const out: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!km) continue;
    const [, k, raw] = km;
    let v: unknown = raw.trim().replace(/^"(.*)"$/, "$1");
    if (typeof v === "string" && v.startsWith("[") && v.endsWith("]")) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }
    out[k] = v;
  }
  return out;
}

export default function App() {
  const { state, currentNode, backlinks, actions } = useVault();
  const [view, setView] = useState<MainView>("editor");
  const [paletteOpen, setPaletteOpen] = useState(false);

  // mock 模式:首挂载即打开种子 vault,浏览器开箱可看。
  useEffect(() => {
    if (ipc.isMock()) void actions.openVault("/mock-vault");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘K / Ctrl+K 唤起命令面板。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const frontmatter = state.content ? parseFrontmatter(state.content) : null;

  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        view={view}
        onNavigate={setView}
        onOpenPalette={() => setPaletteOpen(true)}
        actions={actions}
      />
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0">
          <Sidebar
            entries={state.entries}
            currentPath={state.currentPath}
            actions={actions}
          />
        </div>

        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            {view === "editor" && (
              <Editor
                value={state.content}
                onChange={actions.setContent}
                hasNote={state.currentPath !== null}
              />
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
          </div>

          {view === "editor" && (
            <div className="w-64 shrink-0 border-l border-crust">
              <Inspector
                node={currentNode}
                frontmatter={frontmatter}
                backlinks={backlinks}
                actions={actions}
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
        onNavigate={(v) => {
          setView(v);
        }}
      />
    </div>
  );
}
