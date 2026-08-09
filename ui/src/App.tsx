/**
 * App —— OpenObsidian 主壳。
 *
 * 三栏布局(参考 Obsidian):
 *   左:Sidebar(文件树)  中:主视图(编辑器/图谱/QQL/搜索)  右:Inspector(反链/属性)
 * 顶 Toolbar 切换主视图;底 StatusBar 显示保存状态。
 *
 * ⌘K 唤起命令面板。mock 模式下首挂载自动打开种子 vault,浏览器即开即用。
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Nav } from "./components/Nav";
import { NoteListView } from "./components/NoteListView";
import type { NavSelection } from "./lib/nav-filter";
import { selectionLabel } from "./lib/nav-filter";
import { Editor, type EditorHandle } from "./components/Editor";
import { WysiwygView } from "./components/WysiwygView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ReadingPane } from "./components/ReadingPane";
import { FindBar } from "./components/FindBar";
import { TabBar } from "./components/TabBar";
import { Inspector } from "./components/Inspector";
import { AgentPanel } from "./components/AgentPanel";
import { ColResizeHandle, COL } from "./components/ColResizeHandle";
import { GraphView } from "./components/GraphView";
import { GitPanel } from "./components/GitPanel";
import { CommandPalette, type MainView } from "./components/CommandPalette";
import { CenterToolbar } from "./components/CenterToolbar";
import { StatusBar } from "./components/StatusBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { useVault } from "./lib/store";
import { useTheme } from "./lib/useTheme";
import { useLocale } from "./lib/useLocale";
import { usePersistentState } from "./lib/usePersistentState";
import { GRAPH_FORCES_KEY } from "./lib/settings";
import { DEFAULT_FORCES, normalizeForces, type ForceParams } from "./lib/graph-layout";
import { ipc } from "./lib/ipc";
import { resolveWikiTarget } from "./lib/wikilink";
import { isCanvasPath } from "./lib/canvas";
import { isSheetPath } from "./lib/sheet";
import {
  collectPluginCommands,
  loadPluginFromManifest,
  parsePluginMessage,
  registerPluginCommand,
  sampleHelloMainSource,
  sampleHelloManifest,
  type PluginCommand,
} from "./lib/plugin-host";
import { writeLastPath, readLastRoot, clearLastRoot } from "./lib/last-note";
import {
  EDIT_MODE_KEY,
  EDIT_MODE_MIGRATED_KEY,
  migrateEditMode,
  type EditMode,
} from "./lib/edit-mode";
import { modeFidelityHintKey } from "./lib/edit-mode-ux";
import {
  ATTACHMENT_LAYOUT_KEY,
  ATTACHMENTS_DIR_KEY,
  DEFAULT_ATTACHMENT_LAYOUT,
  DEFAULT_ATTACHMENTS_DIR,
  EDITOR_LAYOUT_KEY,
  normalizeAttachmentLayout,
  normalizeAttachmentsDir,
  type AttachmentLayout,
  type EditorLayoutMode,
} from "./lib/attachments";
import type { PaletteMode } from "./components/CommandPalette";
import {
  buildAppCommands,
  runCommandById,
  type CommandDeps,
} from "./lib/commands";
import { Columns, Code, PencilSimple, Warning, X } from "@phosphor-icons/react";

// 画布视图懒加载:Excalidraw 包体大,隔离到独立 chunk(MIT,见 THIRD_PARTY_NOTICES)。
// 不开画布就不下载该 chunk。
const CanvasView = lazy(() =>
  import("./components/CanvasView").then((m) => ({ default: m.CanvasView })),
);
const SheetView = lazy(() =>
  import("./components/SheetView").then((m) => ({ default: m.SheetView })),
);

export default function App() {
  const { state, currentNode, backlinks, navInfo, actions } = useVault();
  // 默认落地编辑页:不再记忆上次主视图(用户要求每次进入都是编辑器,而非图谱)。
  // 旧值 "openobs.view" 仍可能残留在 localStorage,直接忽略即可。
  const [view, setView] = useState<MainView>("editor");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // ⌘F 文档内查找条:query 跨开关保持;打开时强制 source 以便 CM 全文高亮。
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  /** 打开 Find 前的编辑模式,关闭时还原(避免永久改用户偏好)。 */
  const findPrevModeRef = useRef<EditMode | null>(null);
  const { theme, toggle: toggleTheme, setTheme } = useTheme();
  const { locale, setLocale, toggle: toggleLocale, t } = useLocale();
  const editorRef = useRef<EditorHandle>(null);
  /** 稳定句柄:FindBar 订阅此 state,避免 ref.current 在首渲为 null。 */
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modeHint, setModeHint] = useState<string | null>(null);
  // 附件目录 / 布局 / 并排(B-ED-MEDIA / B-ED-READING)。
  const [attachmentsDir, setAttachmentsDir] = useState(() => {
    try {
      return normalizeAttachmentsDir(localStorage.getItem(ATTACHMENTS_DIR_KEY));
    } catch {
      return DEFAULT_ATTACHMENTS_DIR;
    }
  });
  const [attachmentLayout, setAttachmentLayout] = useState<AttachmentLayout>(
    () => {
      try {
        return normalizeAttachmentLayout(
          localStorage.getItem(ATTACHMENT_LAYOUT_KEY),
        );
      } catch {
        return DEFAULT_ATTACHMENT_LAYOUT;
      }
    },
  );
  const [editorLayout, setEditorLayout] = usePersistentState<EditorLayoutMode>(
    EDITOR_LAYOUT_KEY,
    "edit",
  );
  const persistAttachmentsDir = useCallback((dir: string) => {
    const n = normalizeAttachmentsDir(dir);
    setAttachmentsDir(n);
    try {
      localStorage.setItem(ATTACHMENTS_DIR_KEY, n);
    } catch {
      /* ignore */
    }
  }, []);
  const persistAttachmentLayout = useCallback((layout: AttachmentLayout) => {
    const n = normalizeAttachmentLayout(layout);
    setAttachmentLayout(n);
    try {
      localStorage.setItem(ATTACHMENT_LAYOUT_KEY, n);
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSplit = useCallback(() => {
    setEditorLayout((prev) => (prev === "split" ? "edit" : "split"));
  }, [setEditorLayout]);
  // 双模式:source / wysiwyg。一次性迁移旧默认 source → wysiwyg(见 edit-mode.ts)。
  const [editMode, setEditMode] = useState<EditMode>(() => {
    try {
      const raw = localStorage.getItem(EDIT_MODE_KEY);
      const parsed = raw != null ? (JSON.parse(raw) as unknown) : "wysiwyg";
      const migrated = localStorage.getItem(EDIT_MODE_MIGRATED_KEY);
      const r = migrateEditMode(migrated, parsed);
      if (r.writeMigrated) localStorage.setItem(EDIT_MODE_MIGRATED_KEY, "1");
      if (r.writeMode || raw == null) {
        localStorage.setItem(EDIT_MODE_KEY, JSON.stringify(r.mode));
      }
      return r.mode;
    } catch {
      return "wysiwyg";
    }
  });
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;
  const persistEditMode = useCallback(
    (m: EditMode) => {
      const from = editModeRef.current;
      const hintKey = modeFidelityHintKey(from, m);
      if (hintKey) {
        setModeHint(t(hintKey));
        window.setTimeout(() => setModeHint(null), 6000);
      }
      setEditMode(m);
      try {
        localStorage.setItem(EDIT_MODE_KEY, JSON.stringify(m));
        localStorage.setItem(EDIT_MODE_MIGRATED_KEY, "1");
      } catch {
        // 隐私模式:内存态即可。
      }
    },
    [t],
  );
  // 四区布局:三个非编辑器面板各自可隐藏,状态持久化。切换入口集中在 CenterToolbar
  // 右侧的 Xcode 式切换簇(面板边缘不放按钮)。编辑器常驻,不参与切换。
  const [navOpen, setNavOpen] = usePersistentState("openobs.navOpen", true);
  const [listOpen, setListOpen] = usePersistentState("openobs.listOpen", true);
  const [propsOpen, setPropsOpen] = usePersistentState(
    "openobs.propsOpen",
    true,
  );
  // 栏宽拖拽(B-COL-RESIZE):各栏可拖拽调宽,持久化;最小/默认见 COL。
  const [navWidth, setNavWidth] = usePersistentState<number>(
    "openobs.colW.nav",
    COL.nav.default,
  );
  const [listWidth, setListWidth] = usePersistentState<number>(
    "openobs.colW.list",
    COL.list.default,
  );
  const [rightWidth, setRightWidth] = usePersistentState<number>(
    "openobs.colW.right",
    COL.right.default,
  );
  // 图谱力参数(6A2):持久化;ForceGraphLayer 映射到 d3-force 时夹取,这里存原值即可。
  const [forces, setForces] = usePersistentState<ForceParams>(
    GRAPH_FORCES_KEY,
    DEFAULT_FORCES,
  );
  // Nav 选择模型:中间 List 据它过滤。默认"全部笔记"。
  const [navSelection, setNavSelection] = useState<NavSelection | null>({
    kind: "all",
  });
  // 当前页是否为画布(.canvas / Excalidraw):是则中栏渲染 CanvasView,隐藏编辑/阅读切换与属性面板。
  const isCanvas = state.currentPath !== null && isCanvasPath(state.currentPath);
  const isSheet =
    state.currentPath !== null && isSheetPath(state.currentPath);
  const isSpecialFile = isCanvas || isSheet;

  // F-PLUGIN v1:示例插件 + 命令表(沙箱 iframe 注册)。
  const [pluginCommands, setPluginCommands] = useState<PluginCommand[]>([]);
  const [pluginToast, setPluginToast] = useState<string | null>(null);
  useEffect(() => {
    // 启动时挂载示例插件(manifest 内嵌;不写盘)。后续可从 vault 加载。
    let plugin = loadPluginFromManifest(sampleHelloManifest());
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.display = "none";
    iframe.title = "openobs-plugin-hello";
    document.body.appendChild(iframe);
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const msg = parsePluginMessage(ev.data);
      if (!msg) return;
      if (msg.type === "registerCommand") {
        plugin = registerPluginCommand(plugin, {
          id: msg.id,
          label: msg.label,
        });
        setPluginCommands(collectPluginCommands([plugin]));
      } else if (msg.type === "notify") {
        setPluginToast(msg.message);
        window.setTimeout(() => setPluginToast(null), 2500);
      }
    };
    window.addEventListener("message", onMsg);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(
        `<script>${sampleHelloMainSource().replace(/<\/script>/gi, "<\\/script>")}</script>`,
      );
      doc.close();
    }
    return () => {
      window.removeEventListener("message", onMsg);
      iframe.remove();
    };
  }, []);
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
  // 右栏 tab:inspector(仅 editor 非画布) | agent(任意视图)。doc 11 B-AGENT-RIGHTCOL-TABS。
  // key 加 .v2:旧版默认 agent,现已改为 inspector;新 key 读不到旧值 → 落回 inspector 默认。
  const [rightTab, setRightTab] = usePersistentState<"inspector" | "agent">(
    "openobs.rightTab.v2",
    "inspector",
  );
  const agentOpen = propsOpen && rightTab === "agent";
  // 右栏整体可见:agent tab 任意视图都渲染;inspector 仅 editor 非画布。
  const rightColVisible =
    propsOpen && hasVault && (rightTab === "agent" || (view === "editor" && !isSpecialFile));
  // focus-or-close:点 Props/Agent —— 关着就开并切到该 tab;开着且已是该 tab 就关;开着但在另一 tab 就切过来。
  const onToggleProps = () => {
    if (!propsOpen) {
      setPropsOpen(true);
      setRightTab("inspector");
    } else if (rightTab === "inspector") setPropsOpen(false);
    else setRightTab("inspector");
  };
  const onToggleAgent = () => {
    if (!propsOpen) {
      setPropsOpen(true);
      setRightTab("agent");
    } else if (rightTab === "agent") setPropsOpen(false);
    else setRightTab("agent");
  };

  // 顶栏居中标签:editor 视图取当前 Nav 选择(全部笔记/收件箱/某类型/…);
  // 其余视图取视图名(图谱/搜索/Git)。App 端算好,CenterToolbar 只渲染。
  const contextLabel = useMemo(() => {
    if (view !== "editor") return t(`view.${view}`);
    return navSelection ? selectionLabel(navSelection, t) : t("nav.allNotes");
  }, [view, navSelection, t]);

  // Inspector 用:关系字段 chip 补全候选(全部标题)+ type 下拉选项(vault 内去重 type)。
  const noteTitles = useMemo(
    () => state.snapshot?.nodes.map((n) => n.title) ?? [],
    [state.snapshot],
  );
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of state.snapshot?.nodes ?? []) if (n.type) set.add(n.type);
    return [...set].sort();
  }, [state.snapshot]);

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

  /** 新建表格(F-SHEET):询问名称后建 `.sheet`。 */
  const handleNewSheet = useCallback(() => {
    const name = window.prompt(t("sheet.namePrompt"), "table");
    if (name && name.trim()) void actions.createSheet(name.trim());
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

  /** Nav 文件夹右键:在该目录下新建草稿。 */
  const openNewNoteInFolder = useCallback(
    (folderPath: string) => {
      if (!state.root) return;
      const base = t("newNote.untitled");
      const dir = folderPath.replace(/\/$/, "");
      const prefix = dir ? `${dir}/` : "";
      const taken = new Set(state.entries.map((e) => e.path));
      let path = `${prefix}${base}.md`;
      let i = 1;
      while (taken.has(path)) {
        path = `${prefix}${base} ${i}.md`;
        i++;
      }
      void actions.createNote(path).then(() => setRenamingPath(path));
    },
    [state.root, state.entries, actions, t],
  );

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

  const openNewSheet = useCallback(() => {
    if (state.root) handleNewSheet();
    else void actions.openPicker();
  }, [state.root, actions, handleNewSheet]);

  /**
   * 选中某 Nav 项(智能视图含 Archive / type / folder):设 navSelection **并
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

  const openPalette = useCallback((mode: PaletteMode) => {
    // 打开命令面板前清掉当前焦点(如列表过滤框),避免它的 caret 残留"高亮";
    // 命令面板打开后由其 input autoFocus 接管焦点。
    (document.activeElement as HTMLElement | null)?.blur();
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);

  // path 用 ref,避免 keydown 闭包拿到旧 path。
  const pathRef = useRef(state.currentPath);
  pathRef.current = state.currentPath;

  // ⌘K 命令 · ⌘P 快开 · ⌘O 打开 vault · ⌘⇧F 库内全文。
  // capture:true —— 编辑器可能 stopPropagation。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        (document.activeElement as HTMLElement | null)?.blur();
        setPaletteMode("commands");
        setPaletteOpen((v) => !v);
      } else if (k === "p" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        (document.activeElement as HTMLElement | null)?.blur();
        setPaletteMode("files");
        setPaletteOpen((v) => !v);
      } else if (k === "o" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        void actions.openPicker();
      } else if (k === "f" && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setPaletteMode("search");
        setPaletteOpen(true);
      } else if (k === "," && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setSettingsOpen(true);
      } else if (k === "w" && !e.shiftKey) {
        if (!pathRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        void actions.closeTab(pathRef.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [actions]);

  /** 打开文档内查找:进 editor、必要时切 source 以启用 CM 全文高亮。 */
  const openFind = useCallback(() => {
    const path = pathRef.current;
    if (!path || isCanvasPath(path) || isSheetPath(path)) return;
    setView("editor");
    const mode = editModeRef.current;
    if (mode !== "source") {
      findPrevModeRef.current = mode;
      persistEditMode("source");
    } else {
      findPrevModeRef.current = null;
    }
    setFindOpen(true);
  }, [persistEditMode, setView]);

  const closeFind = useCallback(() => {
    editorRef.current?.clearFind();
    setEditorHandle((h) => {
      h?.clearFind();
      return h;
    });
    setFindOpen(false);
    // 还原打开 Find 前的编辑模式。
    const prev = findPrevModeRef.current;
    findPrevModeRef.current = null;
    if (prev && prev !== "source") persistEditMode(prev);
  }, [persistEditMode]);

  const commandExtras = useMemo((): Omit<
    CommandDeps,
    | "t"
    | "openPicker"
    | "onNewNote"
    | "onNewCanvas"
    | "onNavigate"
    | "refreshIndex"
  > => {
    const hasNote =
      !!state.currentPath &&
      !isCanvasPath(state.currentPath ?? "") &&
      !isSheetPath(state.currentPath ?? "");
    return {
      saveNow: () => void actions.saveNow(),
      openFind: () => openFind(),
      openVaultSearch: () => openPalette("search"),
      openQuickOpen: () => openPalette("files"),
      setEditMode: (m: EditMode) => persistEditMode(m),
      toggleTheme,
      theme,
      toggleLocale,
      openSettings: () => setSettingsOpen(true),
      toggleSplitLayout: () => {
        if (editModeRef.current !== "source") {
          persistEditMode("source");
          setEditorLayout("split");
        } else {
          toggleSplit();
        }
      },
      editorLayout,
      hasCurrentNote: hasNote,
      hasOpenTab: !!state.currentPath,
      canReveal: !ipc.isMock(),
      closeCurrentTab: () => {
        const p = state.currentPath;
        if (p) void actions.closeTab(p);
      },
      archiveCurrent: () => {
        const p = state.currentPath;
        if (p) void actions.deleteNote(p);
      },
      revealCurrent: () => {
        const root = state.root;
        const p = state.currentPath;
        if (root && p && !ipc.isMock()) void ipc.revealInFinder(root, p);
      },
      cleanOrphanMedia: () => {
        const root = state.root;
        if (!root) return;
        void (async () => {
          try {
            const snap = await ipc.mediaIndex(root, false);
            if (snap.orphans.length === 0) {
              window.alert(t("media.orphans.empty"));
              return;
            }
            const ok = window.confirm(
              t("media.orphans.confirm", { n: snap.orphans.length }),
            );
            if (!ok) return;
            const n = await ipc.trashAttachments(
              root,
              snap.orphans.map((o) => o.path),
            );
            window.alert(t("media.orphans.done", { n }));
          } catch (e) {
            window.alert(String(e));
          }
        })();
      },
      onNewSheet: openNewSheet,
      pluginCommands: pluginCommands.map((c) => ({
        id: c.id,
        label: c.label,
        run: () => {
          setPluginToast(t("plugin.ran", { name: c.label }));
          window.setTimeout(() => setPluginToast(null), 2000);
        },
      })),
    };
  }, [
    actions,
    openFind,
    openPalette,
    persistEditMode,
    toggleTheme,
    theme,
    toggleLocale,
    state.currentPath,
    state.root,
    toggleSplit,
    editorLayout,
    setEditorLayout,
    openNewSheet,
    pluginCommands,
    t,
  ]);

  /** 菜单 / 快捷键共用:从当前 deps 建表并按 id 执行。 */
  const dispatchCommand = useCallback(
    (id: string) => {
      const cmds = buildAppCommands({
        t,
        openPicker: () => void actions.openPicker(),
        onNewNote: openNewNote,
        onNewCanvas: openNewCanvas,
        onNavigate: (v) => setView(v),
        refreshIndex: () => void actions.refreshIndex(),
        ...commandExtras,
      });
      runCommandById(cmds, id);
    },
    [
      t,
      actions,
      openNewNote,
      openNewCanvas,
      setView,
      commandExtras,
    ],
  );

  // 桌面应用菜单 → 注册表 id。
  useEffect(() => {
    if (ipc.isMock()) return;
    let unlisten: (() => void) | undefined;
    void listen<string>("menu-action", (ev) => {
      dispatchCommand(ev.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [dispatchCommand]);

  // 顶部拖拽区(data-drag-region):单击拖动窗口,双击切换最大化/还原。
  // 用 mousedown 延迟启动拖拽,给双击留判定窗口 —— 双击的第一次按下不会立即
  // startDragging,从而避开 macOS 原生 performDrag 的 grab-to-restore:它会先把
  // maximized 标志清掉、却不动窗口大小,导致 toggleMaximize 误判为「未最大化」再
  // 最大化一次,表现为「最大化后双击不还原」(见 tauri#11945)。延迟内若来了第二次
  // 按下即判为双击:取消拖拽、改走 toggleMaximize(此时状态未被搞乱,可正确双向)。
  useEffect(() => {
    if (ipc.isMock()) return; // 浏览器 dev 无窗口概念。
    const win = getCurrentWindow();
    let dragTimer: ReturnType<typeof setTimeout> | null = null;
    let lastDown = 0;
    const DRAG_DELAY = 200; // 拖拽启动延迟 ≈ 双击判定窗口(需 ≤ 双击间隔)。
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 落在交互元素(按钮/输入框等)上不接管,交给它们自己的点击。
      if (
        target.closest(
          'button, input, select, textarea, a[href], [role="button"], [contenteditable="true"]',
        )
      )
        return;
      if (!target.closest("[data-drag-region]")) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - lastDown < DRAG_DELAY) {
        // 双击:取消待拖拽,切换最大化(状态未被 grab 搞乱,可正确双向)。
        if (dragTimer) {
          clearTimeout(dragTimer);
          dragTimer = null;
        }
        e.preventDefault();
        void win.toggleMaximize();
        lastDown = 0;
        return;
      }
      lastDown = now;
      if (dragTimer) clearTimeout(dragTimer);
      dragTimer = setTimeout(() => {
        dragTimer = null;
        void win.startDragging();
      }, DRAG_DELAY);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      if (dragTimer) clearTimeout(dragTimer);
    };
  }, []);

  // ⌘F 文内查找(不含 Shift → 库搜是 ⌘⇧F)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      e.stopPropagation();
      if (findOpen) {
        setFindOpen(true);
      } else {
        openFind();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [findOpen, openFind]);

  // Editor 挂载后同步句柄给 FindBar(不可在 ref 回调里 setState,会触发无限更新)。
  useEffect(() => {
    if (editMode === "source" && view === "editor" && !isCanvas && findOpen) {
      const id = requestAnimationFrame(() => {
        setEditorHandle(editorRef.current);
      });
      return () => cancelAnimationFrame(id);
    }
    // 关闭查找或不在 source 时清空句柄(不在 render 路径反复 set 同一 null)。
    setEditorHandle((prev) => (prev == null ? prev : null));
  }, [editMode, view, isCanvas, state.currentPath, findOpen]);

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
      {/* 上半区横向并排:左半(顶栏 + 导航/列表/编辑器)+ 右栏。右栏**全高**——与顶栏
          齐高、其下不再压一条自己的表头,故右侧顶部没有空占位条(透明标题栏拖拽区改由
          右栏表头 data-drag-region 承担);状态栏仍在底部全宽。 */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
      {/* 全宽顶栏:视图切换 + Xcode 式面板切换簇,横跨四区、穿透列间分隔线。
          透明标题栏(Overlay)下,它也是窗口拖拽区(内部留出 macOS 交通灯空间,见 CenterToolbar)。 */}
      <CenterToolbar
        view={view}
        onNavigate={setView}
        onOpenPalette={() => {
          setPaletteMode("commands");
          setPaletteOpen(true);
        }}
        t={t}
        contextLabel={contextLabel}
        canBack={navInfo.canBack}
        canForward={navInfo.canForward}
        onBack={() => void actions.goBack()}
        onForward={() => void actions.goForward()}
        navOpen={navOpen}
        listOpen={listOpen}
        propsOpen={propsOpen && rightTab === "inspector"}
        agentOpen={agentOpen}
        navWidth={navWidth}
        listWidth={listWidth}
        onToggleNav={() => setNavOpen((v) => !v)}
        onToggleList={() => setListOpen((v) => !v)}
        onToggleProps={onToggleProps}
        onToggleAgent={onToggleAgent}
        showList={showList}
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
          <div
            className="shrink-0 border-r border-crust"
            style={{ width: navWidth }}
          >
            <Nav
              entries={state.entries}
              snapshot={state.snapshot}
              navSelection={navSelection}
              onNavSelect={handleNavSelect}
              // 快速打开/命令面板打开时不高亮左侧筛选(浮层与 Nav 选择解耦)。
              isEditorView={view === "editor" && !paletteOpen}
              onMoveNote={(from, dir) => void actions.moveNote(from, dir)}
              onNewNoteInFolder={openNewNoteInFolder}
              t={t}
            />
          </div>
        )}
        {navOpen && (
          <ColResizeHandle
            width={navWidth}
            min={COL.nav.min}
            side="right"
            onChange={setNavWidth}
          />
        )}

        {/* 区 2:列表(可隐藏,仅 editor 视图)。据 navSelection 过滤;点行 → 编辑器。 */}
        {showList && (
          <div
            data-testid="note-list"
            className="shrink-0 overflow-y-auto border-r border-crust bg-base"
            style={{ width: listWidth }}
          >
            <NoteListView
              root={state.root}
              snapshot={state.snapshot}
              currentPath={state.currentPath}
              navSelection={navSelection}
              renamingPath={renamingPath}
              onRenameCommit={commitRename}
              onRenameCancel={cancelRename}
              onStartRename={(p) => setRenamingPath(p)}
              actions={actions}
              t={t}
            />
          </div>
        )}
        {showList && (
          <ColResizeHandle
            width={listWidth}
            min={COL.list.min}
            side="right"
            onChange={setListWidth}
          />
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
                  ) : isSheet ? (
                    <Suspense
                      fallback={
                        <div className="flex h-full items-center justify-center text-[13px] text-overlay">
                          {t("sheet.loading")}
                        </div>
                      }
                    >
                      <SheetView
                        key={state.currentPath}
                        content={state.content}
                        onSave={actions.setContent}
                        t={t}
                      />
                    </Suspense>
                  ) : editMode === "source" ? (
                    <div
                      className={
                        editorLayout === "split"
                          ? "flex h-full min-h-0"
                          : "h-full min-h-0"
                      }
                      data-testid={
                        editorLayout === "split" ? "editor-split" : "editor-edit"
                      }
                    >
                      <div
                        className={
                          editorLayout === "split"
                            ? "min-w-0 flex-1 border-r border-crust"
                            : "h-full"
                        }
                      >
                        <Editor
                          ref={editorRef}
                          value={state.content}
                          onChange={actions.setContent}
                          hasNote={state.currentPath !== null}
                          theme={theme}
                          noteTitles={noteTitles}
                          root={state.root}
                          onFollow={handleFollow}
                          t={t}
                          attachmentsDir={attachmentsDir}
                          attachmentLayout={attachmentLayout}
                          notePath={state.currentPath}
                        />
                      </div>
                      {editorLayout === "split" && (
                        <div className="min-w-0 flex-1">
                          <ReadingPane
                            content={state.content}
                            root={state.root}
                            onFollow={handleFollow}
                            hasNote={state.currentPath !== null}
                            t={t}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <ErrorBoundary
                      onError={() => setEditMode("source")}
                      fallback={
                        <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-subtext">
                          <div className="max-w-xs">
                            <p className="mb-1 font-medium text-text">
                              此笔记在富文本模式下渲染失败
                            </p>
                            <p>已为你切换到源码模式,可在源码模式下查看 / 编辑。</p>
                          </div>
                        </div>
                      }
                    >
                      <WysiwygView
                        key={state.currentPath ?? "empty"}
                        content={state.content}
                        onChange={actions.setContent}
                        onFollow={handleFollow}
                        noteTitles={noteTitles}
                        hasNote={state.currentPath !== null}
                        theme={theme}
                        root={state.root}
                        attachmentsDir={attachmentsDir}
                        attachmentLayout={attachmentLayout}
                        notePath={state.currentPath}
                        t={t}
                      />
                    </ErrorBoundary>
                  )}
                  {modeHint && !isSpecialFile && (
                    <div
                      data-testid="mode-fidelity-hint"
                      className="absolute bottom-2 left-2 right-2 z-20 rounded border border-yellow/40 bg-mantle/95 px-2.5 py-1.5 text-[11px] text-subtext shadow"
                    >
                      {modeHint}
                    </div>
                  )}
                  {!isSpecialFile && state.currentPath !== null && (
                    <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                      {editMode === "source" && (
                        <button
                          type="button"
                          data-testid="toggle-split"
                          onClick={toggleSplit}
                          className="flex items-center gap-1 rounded bg-surface/80 px-2 py-1 text-[12px] text-subtext hover:bg-surface2"
                          title={
                            editorLayout === "split"
                              ? t("editor.layout.edit")
                              : t("editor.layout.split")
                          }
                        >
                          <Columns size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          persistEditMode(
                            editMode === "source" ? "wysiwyg" : "source",
                          )
                        }
                        className="flex items-center gap-1 rounded bg-surface/80 px-2 py-1 text-[12px] text-subtext hover:bg-surface2"
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
                    </div>
                  )}
                  {pluginToast && (
                    <div className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded bg-mantle px-3 py-1.5 text-[12px] text-text shadow border border-crust">
                      {pluginToast}
                    </div>
                  )}
                  {findOpen && !isSpecialFile && state.currentPath !== null && (
                    <FindBar
                      query={findQuery}
                      onQueryChange={setFindQuery}
                      onClose={closeFind}
                      t={t}
                      editor={editMode === "source" ? editorHandle : null}
                      documentText={state.content}
                    />
                  )}
                </div>
              </div>
            )}
            {view === "graph" && (
              <GraphView
                snapshot={state.snapshot}
                currentId={currentNode?.id ?? null}
                actions={actions}
                root={state.root ?? ""}
                forces={forces}
                t={t}
              />
            )}
            {view === "git" && <GitPanel root={state.root} t={t} />}
          </div>
        </div>
      </div>
        </div>

        {/* 区 4:右栏(可隐藏,全高):agent tab 任意视图;inspector tab 仅 editor 非画布。
            与顶栏齐高,故右侧顶部不再有空占位条。 */}
        {rightColVisible && (
          <ColResizeHandle
            width={rightWidth}
            min={COL.right.min}
            side="left"
            onChange={setRightWidth}
          />
        )}
        {rightColVisible && (
          <div
            className="shrink-0 border-l border-crust"
            style={{ width: rightWidth }}
          >
            {rightTab === "agent" ? (
              <AgentPanel
                root={state.root ?? ""}
                t={t}
                getAiContext={actions.buildAiContextMd}
                getContextCandidates={actions.contextCandidates}
              />
            ) : (
              <Inspector
                node={currentNode}
                content={state.content}
                backlinks={backlinks}
                actions={actions}
                onJumpToLine={(line) => editorRef.current?.scrollToLine(line)}
                noteTitles={noteTitles}
                typeOptions={typeOptions}
                vaultNodes={state.snapshot?.nodes ?? []}
                root={state.root}
                t={t}
              />
            )}
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
        onOpenChange={(open) => {
          setPaletteOpen(open);
          if (!open) setPaletteMode("commands");
        }}
        snapshot={state.snapshot}
        entryPaths={state.entries
          .filter((e) => !e.is_dir)
          .map((e) => e.path)}
        recentPaths={state.openPaths}
        actions={actions}
        onNewNote={openNewNote}
        onNewCanvas={openNewCanvas}
        onNavigate={(v) => {
          setView(v);
        }}
        t={t}
        mode={paletteMode}
        commandExtras={commandExtras}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        vaultRoot={state.root}
        settings={{
          theme,
          locale,
          defaultEditMode: editMode,
          attachmentsDir,
          attachmentLayout,
          editorLayout,
          graphForces: normalizeForces(forces),
        }}
        onChange={(patch) => {
          if (patch.theme) setTheme(patch.theme);
          if (patch.locale) setLocale(patch.locale);
          if (patch.defaultEditMode) persistEditMode(patch.defaultEditMode);
          if (patch.attachmentsDir != null) {
            persistAttachmentsDir(patch.attachmentsDir);
          }
          if (patch.attachmentLayout != null) {
            persistAttachmentLayout(patch.attachmentLayout);
          }
          if (patch.editorLayout != null) {
            setEditorLayout(patch.editorLayout);
          }
          if (patch.graphForces != null) {
            setForces(normalizeForces(patch.graphForces));
          }
        }}
        t={t}
      />
    </div>
  );
}
