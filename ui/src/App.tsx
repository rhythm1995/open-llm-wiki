/**
 * App —— Open LLM Wiki 主壳。
 *
 * 三栏布局(参考 Obsidian):
 *   左:Sidebar(文件树)  中:主视图(编辑器/图谱/库健康/Git)  右:Inspector(反链/属性)
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
import { WysiwygView, type WysiwygHandle } from "./components/WysiwygView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ReadingPane } from "./components/ReadingPane";
import { FindBar } from "./components/FindBar";
import { TabBar } from "./components/TabBar";
import { Inspector } from "./components/Inspector";
import { AgentPanel } from "./components/AgentPanel";
import { ColResizeHandle, COL } from "./components/ColResizeHandle";
import { GraphView } from "./components/GraphView";
import { GitPanel } from "./components/GitPanel";
import { HealthView } from "./components/HealthView";
import { CommandPalette, type MainView } from "./components/CommandPalette";
import { CenterToolbar } from "./components/CenterToolbar";
import { StatusBar } from "./components/StatusBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { HelpGuideDialog } from "./components/HelpGuideDialog";
import { useVault } from "./lib/store";
import { useTheme } from "./lib/useTheme";
import { useLocale } from "./lib/useLocale";
import { usePersistentState } from "./lib/usePersistentState";
import { GRAPH_FORCES_KEY } from "./lib/settings";
import { DEFAULT_FORCES, normalizeForces, type ForceParams } from "./lib/graph-layout";
import { ipc } from "./lib/ipc";
import { frontmatterLineOffset } from "./lib/frontmatter";
import { openProjectIssues, openUserDocs } from "./lib/project";
import { subscribeMenuAction } from "./lib/menu-action";
import { resolveWikiTarget } from "./lib/wikilink";
import { isCanvasPath } from "./lib/canvas";
import { isSheetPath } from "./lib/sheet";
import {
  findCloseRestore,
  findOpenPlan,
  matchAppHotkey,
} from "./lib/app-hotkeys";
import {
  buildIngestPrompt,
  detectWikiIngestSkill,
  digestEligibility,
} from "./lib/wiki-digest";
import { buildVaultQueryPrompt } from "./lib/vault-query";
import {
  isHealthLoadPath,
  matchHealthQuestion,
  type HealthMetricId,
  type HealthQueryNote,
} from "./lib/health-catalog";
import {
  collectPluginCommands,
  loadPluginFromManifest,
  parsePluginMessage,
  registerPluginCommand,
  sampleHelloMainSource,
  sampleHelloManifest,
  type PluginCommand,
} from "./lib/plugin-host";
import {
  writeLastPath,
  readLastRoot,
  forgetRecentRoot,
} from "./lib/last-note";
import { WelcomeEmpty } from "./components/WelcomeEmpty";
import {
  readWelcomeMgPlacement,
  writeWelcomeMgPlacement,
  type WelcomeMgPlacement,
} from "./lib/welcome-mg-pref";
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
  // 旧值 "open-llm-wiki.view" 仍可能残留在 localStorage,直接忽略即可。
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
  const wysiwygRef = useRef<WysiwygHandle>(null);
  /** 稳定句柄:FindBar 订阅此 state,避免 ref.current 在首渲为 null。 */
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 设置打开时默认 tab;记忆接入直达用 "agent"。 */
  const [settingsTab, setSettingsTab] = useState<
    "general" | "agent" | "diagnostics"
  >("general");
  const [helpOpen, setHelpOpen] = useState(false);
  const openSettings = useCallback((tab: "general" | "agent" | "diagnostics" = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);
  const openAgentOnboard = useCallback(() => openSettings("agent"), [openSettings]);
  /** 「提炼进 Wiki」→ Agent composer 预填(token 变化触发写入)。 */
  const [agentComposerSeed, setAgentComposerSeed] = useState<{
    text: string;
    token: number;
    banner?: "digest" | "query";
  } | null>(null);
  const [agentSeedToast, setAgentSeedToast] = useState<string | null>(null);
  const [queryNotes, setQueryNotes] = useState<HealthQueryNote[]>([]);
  const [healthFocusId, setHealthFocusId] = useState<HealthMetricId | null>(
    null,
  );
  /** 点过「提炼」后顶栏改文案,直到换笔记。 */
  const [digestArmed, setDigestArmed] = useState(false);
  /** vault 是否已装 wiki-ingest skill(null=探测中)。 */
  const [wikiSkillPresent, setWikiSkillPresent] = useState<boolean | null>(
    null,
  );
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
  const [navOpen, setNavOpen] = usePersistentState("open-llm-wiki.navOpen", true);
  const [listOpen, setListOpen] = usePersistentState("open-llm-wiki.listOpen", true);
  const [propsOpen, setPropsOpen] = usePersistentState(
    "open-llm-wiki.propsOpen",
    true,
  );
  // 栏宽拖拽(B-COL-RESIZE):各栏可拖拽调宽,持久化;最小/默认见 COL。
  const [navWidth, setNavWidth] = usePersistentState<number>(
    "open-llm-wiki.colW.nav",
    COL.nav.default,
  );
  const [listWidth, setListWidth] = usePersistentState<number>(
    "open-llm-wiki.colW.list",
    COL.list.default,
  );
  const [rightWidth, setRightWidth] = usePersistentState<number>(
    "open-llm-wiki.colW.right",
    COL.right.default,
  );
  // 图谱力参数(6A2):持久化默认;设置里已不提供调参 UI,图谱视图直接用此值。
  const [forces] = usePersistentState<ForceParams>(
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
    iframe.title = "open-llm-wiki-plugin-hello";
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
    "open-llm-wiki.rightTab.v2",
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

  /** Source 笔记 → 是否展示「提炼进 Wiki」(图谱优先判已有 Summary)。 */
  const digestInfo = useMemo(() => {
    if (isSpecialFile || !state.currentPath) {
      return { phase: "hidden" as const, type: null, kind: null };
    }
    return digestEligibility({
      path: state.currentPath,
      content: state.content,
      snapshotType: currentNode?.type ?? null,
      nodes: state.snapshot?.nodes ?? [],
      edges: state.snapshot?.edges ?? [],
    });
  }, [
    isSpecialFile,
    state.currentPath,
    state.content,
    state.snapshot,
    currentNode?.type,
  ]);

  // 换笔记 / 换库:顶栏武装态和 leftover 种子一起丢掉。
  // 不在这里清,提炼完成后换一篇再开 Agent 会把旧指令再发一遍。
  useEffect(() => {
    setDigestArmed(false);
    setAgentComposerSeed(null);
  }, [state.currentPath, state.root]);

  // 探测 vault 内 wiki-ingest skill(引导安装);关设置后重探(用户可能刚 npx 安装)。
  // mock 浏览器无点目录文件,不拦提炼。
  useEffect(() => {
    if (!state.root || ipc.isMock()) {
      setWikiSkillPresent(ipc.isMock() ? true : null);
      return;
    }
    let cancelled = false;
    setWikiSkillPresent(null);
    void detectWikiIngestSkill((rel) => ipc.readNote(state.root!, rel)).then(
      (ok) => {
        if (!cancelled) setWikiSkillPresent(ok);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state.root, settingsOpen]);

  const openAgentMemorySettings = useCallback(() => {
    openAgentOnboard();
  }, [openAgentOnboard]);

  const startWikiDigest = useCallback(() => {
    const path = state.currentPath;
    if (!path || digestInfo.phase === "hidden") return;
    // 无 skill 时仍可预填(后备 prompt),但优先引导去设置安装。
    if (wikiSkillPresent === false) {
      setAgentSeedToast(t("wiki.digest.skillMissing"));
      window.setTimeout(() => setAgentSeedToast(null), 6000);
      openAgentMemorySettings();
      return;
    }
    setAgentComposerSeed({
      text: buildIngestPrompt(path, undefined, {
        promoteUntyped: digestInfo.kind === "untyped",
      }),
      token: Date.now(),
      banner: "digest",
    });
    // 强制露出右侧 Agent 栏(持久化偏好可能把右栏关了)。
    setPropsOpen(true);
    setRightTab("agent");
    setDigestArmed(true);
    setAgentSeedToast(t("wiki.digest.seedNote"));
    window.setTimeout(() => setAgentSeedToast(null), 5000);
  }, [
    state.currentPath,
    digestInfo.phase,
    digestInfo.kind,
    wikiSkillPresent,
    openAgentMemorySettings,
    t,
  ]);

  const consumeAgentComposerSeed = useCallback((token: number) => {
    setAgentComposerSeed((cur) => (cur?.token === token ? null : cur));
  }, []);

  const startVaultQuery = useCallback((question?: string) => {
    if (!state.root) return;
    const hit = question ? matchHealthQuestion(question) : null;
    if (hit) {
      setHealthFocusId(hit);
      setView("health");
      return;
    }
    setAgentComposerSeed({
      text: buildVaultQueryPrompt(question),
      token: Date.now(),
      banner: "query",
    });
    setPropsOpen(true);
    setRightTab("agent");
    setAgentSeedToast(t("wiki.query.seedNote"));
    window.setTimeout(() => setAgentSeedToast(null), 5000);
  }, [state.root, t]);

  const openHealthNote = useCallback(
    (path: string) => {
      actions.selectNote(path);
      setView("editor");
    },
    [actions],
  );

  // 库健康:每次进入视图 / snapshot 换新时重读 0–11 条 Query 笔记。离开即丢缓存。
  useEffect(() => {
    if (view !== "health" || !state.root) {
      setQueryNotes([]);
      return;
    }
    let cancelled = false;
    const load = (state.snapshot?.nodes ?? []).filter(
      (n) =>
        (n.type ?? "").toLowerCase() === "query" && isHealthLoadPath(n.path),
    );
    void Promise.all(
      load.map(async (n) => {
        try {
          const content = await ipc.readNote(state.root!, n.path);
          return {
            path: n.path,
            type: n.type,
            content,
          } satisfies HealthQueryNote;
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (!cancelled) {
        setQueryNotes(rows.filter((r): r is HealthQueryNote => r != null));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [view, state.root, state.snapshot]);

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

  /**
   * 启动门闩:有 lastRoot 时先 pending,避免异步 openVault 完成前闪一下欢迎台/MG。
   * - pending: 冷启动且正在恢复 vault
   * - ready: 已有 root 或已确认无 vault 可显示欢迎台
   */
  const [vaultBootReady, setVaultBootReady] = useState(() => {
    if (ipc.isMock()) return false;
    return !readLastRoot();
  });
  const [mgPlacement, setMgPlacement] = useState<WelcomeMgPlacement>(() =>
    readWelcomeMgPlacement(),
  );

  // mock:打开种子 vault;Tauri:恢复上次打开的 vault(无则留欢迎台,等用户点「打开」)。
  useEffect(() => {
    if (ipc.isMock()) {
      void (async () => {
        await actions.openVault("/mock-vault");
        setVaultBootReady(true);
      })();
      return;
    }
    const last = readLastRoot();
    if (!last) {
      setVaultBootReady(true);
      return;
    }
    void (async () => {
      // 目录已不存在等失败:清 last + 最近列表中该项,再放行欢迎台。
      const ok = await actions.openVault(last);
      if (!ok) forgetRecentRoot(last);
      setVaultBootReady(true);
    })();
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
  // capture:true —— 编辑器可能 stopPropagation。判定在 matchAppHotkey。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAppHotkey(e, {
        hasPath: !!pathRef.current,
        viewIsEditor: false,
        paletteOpen: false,
      });
      if (
        action !== "toggle-commands" &&
        action !== "toggle-files" &&
        action !== "open-vault" &&
        action !== "open-search" &&
        action !== "open-settings" &&
        action !== "close-tab"
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (action === "toggle-commands") {
        (document.activeElement as HTMLElement | null)?.blur();
        setPaletteMode("commands");
        setPaletteOpen((v) => !v);
      } else if (action === "toggle-files") {
        (document.activeElement as HTMLElement | null)?.blur();
        setPaletteMode("files");
        setPaletteOpen((v) => !v);
      } else if (action === "open-vault") {
        void actions.openPicker();
      } else if (action === "open-search") {
        setPaletteMode("search");
        setPaletteOpen(true);
      } else if (action === "open-settings") {
        setSettingsOpen(true);
      } else if (action === "close-tab") {
        const p = pathRef.current;
        if (p) void actions.closeTab(p);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [actions]);

  /** 打开文档内查找:进 editor、必要时切 source 以启用 CM 全文高亮。 */
  const openFind = useCallback(() => {
    const plan = findOpenPlan(pathRef.current, editModeRef.current);
    if (!plan.allowed) return;
    setView("editor");
    if (plan.switchToSource) {
      findPrevModeRef.current = editModeRef.current;
      // 只临时切源码做高亮,不写进默认编辑模式。
      setEditMode("source");
    } else {
      findPrevModeRef.current = null;
    }
    setFindOpen(true);
  }, [setView]);

  const closeFind = useCallback(() => {
    editorRef.current?.clearFind();
    setEditorHandle((h) => {
      h?.clearFind();
      return h;
    });
    setFindOpen(false);
    const restore = findCloseRestore(findPrevModeRef.current);
    findPrevModeRef.current = null;
    if (restore) setEditMode(restore);
  }, []);

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
      openSettings: () => openSettings("general"),
      openUserDocs: () => openUserDocs(),
      reportIssue: () => openProjectIssues(),
      openAgentOnboard: () => openAgentOnboard(),
      startWikiDigest: () => startWikiDigest(),
      canWikiDigest:
        digestInfo.phase === "ready" || digestInfo.phase === "done",
      startVaultQuery: state.root ? startVaultQuery : undefined,
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
    openSettings,
    openAgentOnboard,
    startWikiDigest,
    startVaultQuery,
    digestInfo.phase,
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

  // 桌面应用菜单 → 注册表 id。listen 异步 + dispatch 常换身份时必须只订一次。
  const dispatchCommandRef = useRef(dispatchCommand);
  dispatchCommandRef.current = dispatchCommand;
  useEffect(() => {
    if (ipc.isMock()) return;
    return subscribeMenuAction(
      (event, handler) =>
        listen<string>(event, (ev) => handler({ payload: ev.payload })),
      () => (id) => dispatchCommandRef.current(id),
    );
  }, []);

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
      if (matchAppHotkey(e, { hasPath: true, viewIsEditor: false, paletteOpen: false }) !== "find-in-doc") {
        return;
      }
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
      if (
        matchAppHotkey(e, {
          hasPath: true,
          viewIsEditor: false,
          paletteOpen: false,
        }) !== "save"
      ) {
        return;
      }
      e.preventDefault();
      void actions.saveNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions.saveNow]);

  // ⌘W / Ctrl+W 关闭当前标签(编辑器视图、有当前笔记、且无对话框/面板遮挡时)。
  // 注:浏览器 dev 下 ⌘W 会被浏览器抢占关闭页签,仅在 Tauri 桌面 app 生效(见 deferred)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "editor" || paletteOpen) return;
      if (
        matchAppHotkey(e, {
          hasPath: !!state.currentPath,
          viewIsEditor: false,
          paletteOpen: false,
        }) !== "close-tab"
      ) {
        return;
      }
      e.preventDefault();
      if (state.currentPath) actions.closeTab(state.currentPath);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, state.currentPath, paletteOpen, actions.closeTab]);

  // 标签循环切换:Ctrl+Tab/Ctrl+Shift+Tab、⌘/Ctrl+Shift+[ 与 ]、⌘/Ctrl+PageUp/PageDown。
  // 注:Ctrl+Tab 在浏览器 dev 里被浏览器抢占(preventDefault 无效),仅在 Tauri 桌面 app 生效;
  // ⌘Shift+[] 与 PageUp/Down 在桌面 webview 内可用。见 deferred「标签循环快捷键」。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAppHotkey(e, {
        hasPath: true,
        viewIsEditor: view === "editor",
        paletteOpen,
      });
      if (action !== "cycle-tab-next" && action !== "cycle-tab-prev") return;
      e.preventDefault();
      void actions.cycleTab(action === "cycle-tab-next" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, paletteOpen, actions.cycleTab]);

  // 记下当前笔记,下次打开同 vault 时恢复(按 root 分键;恢复逻辑在 openVault 里)。
  useEffect(() => {
    if (!state.root || !state.currentPath) return;
    writeLastPath(state.root, state.currentPath);
  }, [state.root, state.currentPath]);

  // 右栏宽度收敛:① 旧持久化值可能低于当前 COL.right.min(常量上调过,读取时不校验);
  // ② 窗口缩到固定宽度列装不下时会互相遮挡。mount + resize 时把右栏夹回 [min, max],
  // 优先保住 agent 面板,编辑器(唯一 flex 栏)最多让到 COL.editor.min。值没变就不写,
  // 避免拖窗口边时每帧都刷 localStorage。
  const rightWidthRef = useRef(rightWidth);
  rightWidthRef.current = rightWidth;
  useEffect(() => {
    const fit = () => {
      const max = Math.max(
        COL.right.min,
        window.innerWidth - COL.nav.min - COL.list.min - COL.editor.min,
      );
      const w = rightWidthRef.current;
      const next = Math.min(max, Math.max(COL.right.min, w));
      if (next !== w) setRightWidth(next);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [setRightWidth]);

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
        showBrandLogo
        onBrandLogoClick={() => setHelpOpen(true)}
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

        {/* 区 3:编辑器(常驻,不参与切换)。无 vault → 欢迎台;有 vault → 主视图。 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 min-w-0">
            {!vaultBootReady ? (
              <div
                data-testid="vault-boot"
                className="flex h-full items-center justify-center bg-base"
                aria-busy="true"
              >
                <img
                  src="/olw-mark.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 animate-pulse object-contain opacity-70"
                  draggable={false}
                />
              </div>
            ) : !state.root ? (
              <WelcomeEmpty
                t={t}
                onOpenVault={() => void actions.openPicker()}
                onOpenRoot={(root) => actions.openVault(root)}
                onCreateSample={async () => {
                  const path = await ipc.createSampleVault();
                  const ok = await actions.openVault(path);
                  return ok ? path : null;
                }}
                onMgPlacementChange={setMgPlacement}
                onOpenAgentOnboard={openAgentOnboard}
              />
            ) : (
              <>
            {view === "editor" && (
              <div className="flex h-full flex-col">
                <TabBar
                  openPaths={state.openPaths}
                  activePath={state.currentPath}
                  snapshot={state.snapshot}
                  actions={actions}
                  t={t}
                />
                {digestInfo.phase !== "hidden" && !isSpecialFile && (
                  <div
                    data-testid="wiki-digest-bar"
                    className={
                      wikiSkillPresent === false
                        ? "flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-yellow)]/40 bg-[var(--color-yellow)]/10 px-3 py-1.5"
                        : digestArmed
                          ? "flex shrink-0 items-center gap-2 border-b border-blue/40 bg-blue/10 px-3 py-1.5"
                          : "flex shrink-0 items-center gap-2 border-b border-crust bg-mantle px-3 py-1.5"
                    }
                  >
                    <p className="min-w-0 flex-1 text-[11px] leading-snug text-subtext">
                      {wikiSkillPresent === false
                        ? t("wiki.digest.skillMissing")
                        : digestArmed
                          ? t("wiki.digest.armed")
                          : digestInfo.phase === "done"
                            ? t("wiki.digest.hintDone")
                            : digestInfo.kind === "untyped"
                              ? t("wiki.digest.hintUntyped")
                              : t("wiki.digest.hint")}
                    </p>
                    {wikiSkillPresent === false ? (
                      <button
                        type="button"
                        data-testid="wiki-digest-install-skill"
                        onClick={openAgentMemorySettings}
                        className="shrink-0 rounded-md bg-blue px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
                      >
                        {t("wiki.digest.skillMissingAction")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="wiki-digest-btn"
                        onClick={startWikiDigest}
                        className="shrink-0 rounded-md bg-blue px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
                      >
                        {digestArmed
                          ? t("wiki.digest.actionAgain")
                          : digestInfo.phase === "ready"
                            ? t("wiki.digest.action")
                            : t("wiki.digest.actionAgain")}
                      </button>
                    )}
                  </div>
                )}
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
                        notePath={state.currentPath}
                        root={state.root}
                        onFlush={actions.writeScoped}
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
                        notePath={state.currentPath}
                        root={state.root}
                        onFlush={actions.writeScoped}
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
                        ref={wysiwygRef}
                        key={state.currentPath ?? "empty"}
                        content={state.content}
                        onChange={actions.setContent}
                        onFlush={actions.writeScoped}
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
            {view === "health" && state.root && (
              <HealthView
                root={state.root}
                snapshot={state.snapshot}
                queryNotes={queryNotes}
                t={t}
                focusMetric={healthFocusId}
                onFocusConsumed={() => setHealthFocusId(null)}
                onOpenNote={openHealthNote}
                onAskAgent={startVaultQuery}
              />
            )}
            {view === "git" && <GitPanel root={state.root} t={t} />}
              </>
            )}
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
            // 拖拽上限:给编辑器留保底,防把 agent 拖到过宽反过来挤死中间栏。
            max={Math.max(
              COL.right.min,
              window.innerWidth - COL.nav.min - COL.list.min - COL.editor.min,
            )}
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
                onOpenMemoryOnboard={openAgentOnboard}
                composerSeed={agentComposerSeed}
                onSeedConsumed={consumeAgentComposerSeed}
              />
            ) : (
              <Inspector
                node={currentNode}
                content={state.content}
                backlinks={backlinks}
                actions={actions}
                onJumpToHeading={(target) => {
                  if (editModeRef.current === "source") {
                    editorRef.current?.scrollToLine(
                      target.bodyLine +
                        frontmatterLineOffset(state.content),
                    );
                    return;
                  }
                  wysiwygRef.current?.scrollToHeading(target.index);
                }}
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

      <HelpGuideDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        t={t}
        showRestoreMg={mgPlacement === "corner"}
        onRestoreMg={() => {
          writeWelcomeMgPlacement("hero");
          setMgPlacement("hero");
        }}
        onOpenAgentOnboard={openAgentOnboard}
        onOpenSettings={() => openSettings("general")}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
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
        }}
        t={t}
      />

      {agentSeedToast && (
        <div
          data-testid="agent-seed-toast"
          className="fixed bottom-2 left-1/2 z-30 -translate-x-1/2 rounded border border-crust bg-mantle px-3 py-1.5 text-[12px] text-text shadow"
        >
          {agentSeedToast}
        </div>
      )}
    </div>
  );
}
