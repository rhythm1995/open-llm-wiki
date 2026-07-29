/**
 * useVault —— 全局 vault 状态与生命周期。
 *
 * 一个自定义 hook 持有所有跨组件共享的状态(vault 根、文件树、索引快照、当前
 * 笔记、脏标志),并暴露动作(打开/选择/新建/删除/保存)。Editor 自动保存经由
 * 防抖落到 write_note;保存后再节流重建索引,使反链/图谱跟上编辑。
 *
 * 选择性地把派生数据(当前节点、反链)一并算好,避免各组件重复遍历 edges。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ipc, type EdgeOut, type NodeOut, type VaultEntry, type VaultSnapshot } from "./ipc";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { tabReduce } from "./tabs";
import {
  emptyHistory,
  navigateBack,
  navigateForward,
  recordNavigation,
  type NavHistory,
} from "./nav-history";
import { applyTemplate, defaultTemplate } from "./template";
import { buildAiContext } from "./ai-context";
import { pickRestorableNote, readLastPath, writeLastRoot } from "./last-note";

export interface Backlink {
  from: NodeOut;
  edge: EdgeOut;
}

export interface VaultState {
  root: string | null;
  entries: VaultEntry[];
  snapshot: VaultSnapshot | null;
  currentPath: string | null;
  /** 打开的标签页(有序路径)。currentPath 是其中的激活页。 */
  openPaths: string[];
  content: string;
  dirty: boolean;
  saveState: "idle" | "saving" | "saved";
  error: string | null;
}

const INITIAL: VaultState = {
  root: null,
  entries: [],
  snapshot: null,
  currentPath: null,
  openPaths: [],
  content: "",
  dirty: false,
  saveState: "idle",
  error: null,
};

const SAVE_DEBOUNCE_MS = 800;
const REINDEX_DEBOUNCE_MS = 1500;
const SAVE_FLASH_MS = 1200;

export function useVault() {
  const [state, setState] = useState<VaultState>(INITIAL);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reindexTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 文件监听(Tauri 桌面):vault-changed 事件 → 节流全量刷新索引。
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // 最近状态用 ref 同步,避免防抖回调闭包拿到旧值。
  const latest = useRef<{
    path: string | null;
    content: string;
    root: string | null;
    dirty: boolean;
    openPaths: string[];
  }>({ path: null, content: "", root: null, dirty: false, openPaths: [] });
  latest.current = {
    path: state.currentPath,
    content: state.content,
    root: state.root,
    dirty: state.dirty,
    openPaths: state.openPaths,
  };
  // 笔记后退/前进历史(浏览器式栈)。ref 持有 + tick 触发顶栏按钮重渲染。
  const navHistory = useRef<NavHistory>(emptyHistory);
  const [, setNavTick] = useState(0);
  const bumpNav = useCallback(() => setNavTick((n) => n + 1), []);

  const refreshIndex = useCallback(async (root: string) => {
    try {
      const snap = await ipc.indexVault(root);
      setState((s) => ({ ...s, snapshot: snap }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, []);

  const saveNow = useCallback(async () => {
    const { path, content, root } = latest.current;
    if (!path || !root) return;
    setState((s) => ({ ...s, saveState: "saving" }));
    try {
      await ipc.writeNote(root, path, content);
      setState((s) => ({ ...s, dirty: false, saveState: "saved" }));
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => {
        setState((s) => ({ ...s, saveState: "idle" }));
      }, SAVE_FLASH_MS);
      // 保存后节流重建索引,反链/图谱跟随更新。
      if (reindexTimer.current) clearTimeout(reindexTimer.current);
      reindexTimer.current = setTimeout(() => {
        void refreshIndex(root);
      }, REINDEX_DEBOUNCE_MS);
    } catch (e) {
      setState((s) => ({ ...s, saveState: "idle", error: String(e) }));
    }
  }, [refreshIndex]);

  const openVault = useCallback(
    async (root: string): Promise<boolean> => {
      try {
        const entries = await ipc.listVault(root);
        const firstMd = entries.find((e) => !e.is_dir);
        // 恢复上次打开的笔记(按 root 分键;命中且仍存在则用之,否则回退首个 .md)。
        const known = entries.map((e) => e.path);
        const restored = pickRestorableNote(readLastPath(root), known);
        const initialPath = restored ?? firstMd?.path ?? null;
        let content = "";
        let currentPath: string | null = null;
        if (initialPath) {
          content = await ipc.readNote(root, initialPath);
          currentPath = initialPath;
        }
        const snap = await ipc.indexVault(root);
        // 切换/重开 vault 时清空导航历史(旧 vault 的栈无意义)。
        navHistory.current = emptyHistory;
        bumpNav();
        setState({
          ...INITIAL,
          root,
          entries,
          snapshot: snap,
          currentPath,
          openPaths: currentPath ? [currentPath] : [],
          content,
        });
        // 记下成功打开的根,下次启动恢复(Tolaria / Obsidian 同款行为)。
        writeLastRoot(root);
        // Tauri 桌面:启动文件监听 —— 外部改动经后端 debounce → vault-changed → 前端
        // 节流 500ms 全量刷新,使图谱/反链/QQL 跟上外部编辑。mock/浏览器无 fs 不监听。
        if (!ipc.isMock()) {
          await ipc.watchVault(root);
          if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
          }
          unlistenRef.current = await listen("vault-changed", () => {
            if (watchTimer.current) clearTimeout(watchTimer.current);
            watchTimer.current = setTimeout(() => {
              void refreshIndex(root);
            }, 500);
          });
        }
        return true;
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
        return false;
      }
    },
    [refreshIndex],
  );

  const openPicker = useCallback(async () => {
    try {
      const picked = await ipc.pickVault();
      if (picked) await openVault(picked);
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, [openVault]);

  /**
   * 打开一篇笔记到编辑器(读盘加载)。`record=true` 时记入导航历史(后退/前进);
   * 后退/前进本身调用时传 false——它们已自己改写栈,若再 record 会重复入栈污染历史。
   * 用户主动跳转(selectNote/createNote/反链点击)都走 record=true。
   */
  const openPath = useCallback(
    async (path: string, record: boolean) => {
      // 切走前先冲刷未保存内容。
      if (latest.current.path && latest.current.dirty) {
        await saveNow();
      }
      const root = latest.current.root;
      if (!root) return;
      try {
        const content = await ipc.readNote(root, path);
        if (record) {
          navHistory.current = recordNavigation(
            navHistory.current,
            latest.current.path,
            path,
          );
          bumpNav();
        }
        setState((s) => ({
          ...s,
          currentPath: path,
          content,
          dirty: false,
          openPaths: s.openPaths.includes(path) ? s.openPaths : [...s.openPaths, path],
        }));
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [bumpNav, saveNow],
  );

  /** 用户主动选择一篇笔记(列表/反链点击等):记入历史。 */
  const selectNote = useCallback((path: string) => openPath(path, true), [openPath]);

  /** 后退到上一篇打开过的笔记;系统导航,不再记入历史。 */
  const goBack = useCallback(async () => {
    const r = navigateBack(navHistory.current, latest.current.path);
    if (!r) return;
    navHistory.current = r[0];
    bumpNav();
    await openPath(r[1], false);
  }, [bumpNav, openPath]);

  /** 前进到下一篇(后退之后才有效);系统导航。 */
  const goForward = useCallback(async () => {
    const r = navigateForward(navHistory.current, latest.current.path);
    if (!r) return;
    navHistory.current = r[0];
    bumpNav();
    await openPath(r[1], false);
  }, [bumpNav, openPath]);

  const setContent = useCallback(
    (next: string) => {
      setState((s) => ({ ...s, content: next, dirty: true }));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveNow();
      }, SAVE_DEBOUNCE_MS);
    },
    [saveNow],
  );

  const createNote = useCallback(
    async (name: string, body?: string) => {
      const root = latest.current.root;
      if (!root) return;
      const path = name.endsWith(".md") ? name : `${name}.md`;
      const initial = body ?? defaultTemplate(name);
      try {
        await ipc.createNote(root, path, initial);
        const entries = await ipc.listVault(root);
        const content = await ipc.readNote(root, path);
        navHistory.current = recordNavigation(navHistory.current, latest.current.path, path);
        bumpNav();
        setState((s) => ({
          ...s,
          entries,
          currentPath: path,
          openPaths: s.openPaths.includes(path) ? s.openPaths : [...s.openPaths, path],
          content,
          dirty: false,
        }));
        await refreshIndex(root);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [refreshIndex],
  );

  /**
   * 从模板创建笔记:读模板内容,做 `{{title}}`/`{{date}}` 替换后作为初始正文。
   * templatePath 为 null 时退化为默认空模板。日期取自本机当天(运行时)。
   */
  const createNoteFromTemplate = useCallback(
    async (name: string, templatePath: string | null) => {
      const root = latest.current.root;
      if (!root) return;
      try {
        let body: string | undefined;
        if (templatePath) {
          const raw = await ipc.readNote(root, templatePath);
          const title = (name.split("/").pop() ?? name).replace(/\.md$/i, "");
          const date = new Date().toISOString().slice(0, 10);
          body = applyTemplate(raw, { title, date });
        }
        await createNote(name, body);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [createNote],
  );

  /**
   * inline 新建草稿笔记(任务3:不弹窗,直接建 + 进 inline 标题重命名)。
   * 在根目录取未占用名(baseName.md / baseName 1.md / …),复用 createNote 落地
   * (含默认模板 frontmatter)并选中之;返回新 path,UI 据此进入列表行 inline 重命名。
   */
  const createDraftNote = useCallback(
    async (baseName: string): Promise<string | null> => {
      const root = latest.current.root;
      if (!root) return null;
      const taken = new Set(state.entries.map((e) => e.path));
      let path = `${baseName}.md`;
      let i = 1;
      while (taken.has(path)) {
        path = `${baseName} ${i}.md`;
        i++;
      }
      await createNote(path);
      return path;
    },
    [createNote, state.entries],
  );

  /**
   * 新建一张 tldraw 画布(F-CANVAS):写空 `.canvas` 文件并打开。画布内容是
   * tldraw 快照 JSON,由 CanvasView 的 store.listen 防抖回写;这里只负责落空壳。
   * 与 createNote 分开:扩展名不同、初始内容为空串、不走模板。
   */
  const createCanvas = useCallback(
    async (name: string) => {
      const root = latest.current.root;
      if (!root) return;
      const path = name.toLowerCase().endsWith(".canvas") ? name : `${name}.canvas`;
      try {
        await ipc.createNote(root, path, "");
        const entries = await ipc.listVault(root);
        navHistory.current = recordNavigation(navHistory.current, latest.current.path, path);
        bumpNav();
        setState((s) => ({
          ...s,
          entries,
          currentPath: path,
          openPaths: s.openPaths.includes(path) ? s.openPaths : [...s.openPaths, path],
          content: "",
          dirty: false,
        }));
        await refreshIndex(root);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [refreshIndex],
  );

  const deleteNote = useCallback(
    async (path: string) => {
      const root = latest.current.root;
      if (!root) return;
      try {
        await ipc.deleteNote(root, path);
        const entries = await ipc.listVault(root);
        // 先用 tab 语义从打开列表里关掉它,决定下一个激活页。
        const afterClose = tabReduce(
          { open: state.openPaths, active: state.currentPath },
          { type: "close", path },
        );
        let currentPath = afterClose.active;
        let content = "";
        if (state.currentPath === path) {
          // 被删的是当前页:若 tab 语义给了邻居就用它,否则回退到首个 .md。
          const fallback =
            currentPath ?? entries.find((e) => !e.is_dir)?.path ?? null;
          currentPath = fallback;
          content = fallback ? await ipc.readNote(root, fallback) : "";
        } else {
          content = state.content;
        }
        setState((s) => ({
          ...s,
          entries,
          currentPath,
          content,
          openPaths: afterClose.open.includes(currentPath ?? "")
            ? afterClose.open
            : currentPath
              ? [...afterClose.open, currentPath]
              : afterClose.open,
        }));
        await refreshIndex(root);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [refreshIndex, state],
  );

  /**
   * 从 git 历史还原已删笔记:后端从最近删除提交检出父版本回工作区,git add 落盘。
   * 还原后刷新文件树 + 索引。`.trash/` 平行机制已移除——删除/还原统一走 git,
   * 唯一真相源是版本库历史。
   */
  const restoreNote = useCallback(
    async (path: string) => {
      const root = latest.current.root;
      if (!root) return;
      try {
        await ipc.gitRestoreNote(root, path);
        const entries = await ipc.listVault(root);
        setState((s) => ({ ...s, entries }));
        await refreshIndex(root);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [refreshIndex],
  );

  /** 关闭一个标签页(不删盘)。激活页被关时,按 tab 语义跳到邻居并读盘。 */
  const closeTab = useCallback(
    async (path: string) => {
      const { root, openPaths, path: currentPath } = latest.current;
      if (!root) return;
      if (latest.current.dirty && currentPath) await saveNow();
      const nextTabs = tabReduce(
        { open: openPaths, active: currentPath },
        { type: "close", path },
      );
      let content = latest.current.content;
      if (nextTabs.active !== currentPath) {
        content = nextTabs.active ? await ipc.readNote(root, nextTabs.active) : "";
      }
      setState((s) => ({
        ...s,
        openPaths: nextTabs.open,
        currentPath: nextTabs.active,
        content,
        dirty: false,
      }));
    },
    [saveNow],
  );

  /** 关闭除指定页之外的所有标签页。 */
  const closeOthers = useCallback(
    async (keepPath: string) => {
      const { root, path: currentPath } = latest.current;
      if (!root) return;
      if (latest.current.dirty && currentPath) await saveNow();
      const nextTabs = tabReduce(
        { open: latest.current.openPaths, active: currentPath },
        { type: "closeOthers", path: keepPath },
      );
      const content =
        keepPath === currentPath ? latest.current.content : await ipc.readNote(root, keepPath);
      setState((s) => ({
        ...s,
        openPaths: nextTabs.open,
        currentPath: nextTabs.active,
        content,
        dirty: false,
      }));
    },
    [saveNow],
  );

  /** 关闭全部标签页。 */
  const closeAllTabs = useCallback(async () => {
    if (latest.current.dirty && latest.current.path) await saveNow();
    setState((s) => ({ ...s, openPaths: [], currentPath: null, content: "", dirty: false }));
  }, [saveNow]);

  /** 拖拽重排标签页:把 from 处的标签移到 to 处(active 不变)。 */
  const reorderTab = useCallback((from: number, to: number) => {
    setState((s) => {
      const next = tabReduce(
        { open: s.openPaths, active: s.currentPath },
        { type: "reorder", from, to },
      );
      return { ...s, openPaths: next.open };
    });
  }, []);

  /**
   * 循环切换标签页(direction:+1 下一个 / -1 上一个,环回)。切换时读盘加载目标笔记。
   * 单页或无打开页时无变化(早退,不触发读盘)。
   */
  const cycleTab = useCallback(
    async (direction: 1 | -1) => {
      const { root, openPaths, path: currentPath } = latest.current;
      if (!root || openPaths.length === 0) return;
      if (latest.current.dirty && currentPath) await saveNow();
      const nextTabs = tabReduce(
        { open: openPaths, active: currentPath },
        { type: "cycle", direction },
      );
      if (nextTabs.active === currentPath) return;
      const content = nextTabs.active ? await ipc.readNote(root, nextTabs.active) : "";
      setState((s) => ({
        ...s,
        currentPath: nextTabs.active,
        content,
        dirty: false,
      }));
    },
    [saveNow],
  );

  /**
   * 重命名一篇笔记(保留原目录;仅改文件名)。
   * 同步刷新打开标签页与当前页指针;若当前页被改名,content 不变(只是路径变了)。
   */
  const renameNote = useCallback(
    async (from: string, newName: string): Promise<string | null> => {
      const root = latest.current.root;
      if (!root) return null;
      const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
      const file = newName.endsWith(".md") ? newName : `${newName}.md`;
      const to = dir ? `${dir}/${file}` : file;
      if (from === to || !file) return null;
      try {
        if (latest.current.dirty && latest.current.path === from) await saveNow();
        await ipc.renameNote(root, from, to);
        const entries = await ipc.listVault(root);
        setState((s) => ({
          ...s,
          entries,
          openPaths: s.openPaths.map((p) => (p === from ? to : p)),
          currentPath: s.currentPath === from ? to : s.currentPath,
        }));
        await refreshIndex(root);
        return to;
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
        return null;
      }
    },
    [saveNow, refreshIndex],
  );

  /**
   * inline 新建草稿的重命名提交(任务3):rename 改文件名 + 把草稿占位 H1
   * (defaultTemplate 的"# 未命名")同步为新名,使笔记标题=文件名。`name` 已由
   * 调用方 sanitize + 空值兜底;这里只做 rename(复用 renameNote)+ H1 替换 + 落盘。
   */
  const commitDraftRename = useCallback(
    async (oldPath: string, name: string): Promise<void> => {
      const newPath = await renameNote(oldPath, name);
      const root = latest.current.root;
      if (!newPath || !root) return;
      // 草稿首行 H1 是占位;替换为新名(无 H1 时开头补一个,保证标题跟随文件名)。
      const prev = latest.current.content;
      const body = /^#[^\n]*\r?\n?/.test(prev)
        ? prev.replace(/^#[^\n]*\r?\n?/, `# ${name}\n\n`)
        : `# ${name}\n\n${prev}`;
      await ipc.writeNote(root, newPath, body);
      setState((s) => ({ ...s, content: body, dirty: false }));
    },
    [renameNote],
  );

  // 卸载时冲刷。
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (reindexTimer.current) clearTimeout(reindexTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (watchTimer.current) clearTimeout(watchTimer.current);
      if (unlistenRef.current) unlistenRef.current();
    };
  }, []);

  /** 清除错误态(错误横幅关闭时调用)。 */
  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  /**
   * 复制为 AI 上下文(F-AI 读侧桥接):把当前笔记 + 其外向链接命中的邻居正文,拼成
   * 一段 markdown 写入剪贴板,便于粘贴给任意 LLM。邻居正文经 readNote 现取;mock 模式
   * 下同样可用(内存 Map)。完整 MCP server(让 agent 反向读写 vault)见路线图。
   * 返回拼好的 markdown(剪贴板被禁用时仍返回,便于降级)。
   */
  const copyAiContext = useCallback(async (): Promise<string | null> => {
    const { root, path, content } = latest.current;
    const snap = state.snapshot;
    if (!root || !path || !snap) return null;
    const cur = snap.nodes.find((n) => n.path === path) ?? null;
    // 外向链接命中的邻居:去重、保留首次出现顺序。
    const seen = new Set<number>();
    const neighborIds: number[] = [];
    if (cur) {
      for (const e of snap.edges) {
        if (e.from === cur.id && e.to != null && !seen.has(e.to)) {
          seen.add(e.to);
          neighborIds.push(e.to);
        }
      }
    }
    const neighbors = [];
    for (const id of neighborIds) {
      const n = snap.nodes.find((x) => x.id === id);
      if (!n) continue;
      const c = await ipc.readNote(root, n.path);
      neighbors.push({ path: n.path, title: n.title, content: c });
    }
    const md = buildAiContext({
      current: { path, title: cur?.title ?? path, content },
      neighbors,
    });
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // 剪贴板被禁用(无 https / 权限)时静默;文本仍返回,调用方可降级提示。
    }
    return md;
  }, [state.snapshot]);

  // ────────── 派生:当前节点 + 反链 ──────────
  const currentNode = useMemo<NodeOut | null>(() => {
    if (!state.snapshot || !state.currentPath) return null;
    return (
      state.snapshot.nodes.find((n) => n.path === state.currentPath) ?? null
    );
  }, [state.snapshot, state.currentPath]);

  const backlinks = useMemo<Backlink[]>(() => {
    if (!state.snapshot || !currentNode) return [];
    const byId = new Map(state.snapshot.nodes.map((n) => [n.id, n]));
    return state.snapshot.edges
      .filter((e) => e.to === currentNode.id)
      .map((edge) => ({ edge, from: byId.get(edge.from)! }))
      .filter((b) => Boolean(b.from));
  }, [state.snapshot, currentNode]);

  // 导航历史可操作性(顶栏后退/前进按钮 disabled 态)。ref 在 render 时读取,
  // bumpNav 保证每次导航后触发重渲染,故此处读到的总是最新值。
  const navInfo = {
    canBack: navHistory.current.back.length > 0,
    canForward: navHistory.current.forward.length > 0,
  };

  return {
    state,
    currentNode,
    backlinks,
    navInfo,
    actions: {
      openPicker,
      openVault,
      selectNote,
      goBack,
      goForward,
      setContent,
      createNote,
      createNoteFromTemplate,
      createDraftNote,
      createCanvas,
      deleteNote,
      renameNote,
      commitDraftRename,
      restoreNote,
      closeTab,
      closeOthers,
      closeAllTabs,
      reorderTab,
      cycleTab,
      clearError,
      saveNow,
      copyAiContext,
      refreshIndex: () => state.root && refreshIndex(state.root),
    },
  };
}

export type VaultActions = ReturnType<typeof useVault>["actions"];
