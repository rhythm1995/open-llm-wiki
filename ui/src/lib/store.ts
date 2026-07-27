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
import { tabReduce } from "./tabs";

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
    async (root: string) => {
      try {
        const [entries] = await Promise.all([ipc.listVault(root)]);
        const firstMd = entries.find((e) => !e.is_dir);
        let content = "";
        let currentPath: string | null = null;
        if (firstMd) {
          content = await ipc.readNote(root, firstMd.path);
          currentPath = firstMd.path;
        }
        const snap = await ipc.indexVault(root);
        setState({
          ...INITIAL,
          root,
          entries,
          snapshot: snap,
          currentPath,
          openPaths: currentPath ? [currentPath] : [],
          content,
        });
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [],
  );

  const openPicker = useCallback(async () => {
    try {
      const picked = await ipc.pickVault();
      if (picked) await openVault(picked);
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, [openVault]);

  const selectNote = useCallback(
    async (path: string) => {
      // 切走前先冲刷未保存内容。
      if (latest.current.path && latest.current.dirty) {
        await saveNow();
      }
      const root = latest.current.root;
      if (!root) return;
      try {
        const content = await ipc.readNote(root, path);
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
    [saveNow],
  );

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
    async (name: string) => {
      const root = latest.current.root;
      if (!root) return;
      const path = name.endsWith(".md") ? name : `${name}.md`;
      const template = `# ${name.replace(/\.md$/, "").split("/").pop()}\n\n`;
      try {
        await ipc.createNote(root, path, template);
        const entries = await ipc.listVault(root);
        const content = await ipc.readNote(root, path);
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

  /**
   * 重命名一篇笔记(保留原目录;仅改文件名)。
   * 同步刷新打开标签页与当前页指针;若当前页被改名,content 不变(只是路径变了)。
   */
  const renameNote = useCallback(
    async (from: string, newName: string) => {
      const root = latest.current.root;
      if (!root) return;
      const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
      const file = newName.endsWith(".md") ? newName : `${newName}.md`;
      const to = dir ? `${dir}/${file}` : file;
      if (from === to || !file) return;
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
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [saveNow, refreshIndex],
  );

  // 卸载时冲刷。
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (reindexTimer.current) clearTimeout(reindexTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

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

  return {
    state,
    currentNode,
    backlinks,
    actions: {
      openPicker,
      openVault,
      selectNote,
      setContent,
      createNote,
      deleteNote,
      renameNote,
      closeTab,
      closeOthers,
      closeAllTabs,
      saveNow,
      refreshIndex: () => state.root && refreshIndex(state.root),
    },
  };
}

export type VaultActions = ReturnType<typeof useVault>["actions"];
