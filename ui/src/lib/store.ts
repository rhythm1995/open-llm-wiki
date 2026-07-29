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

export interface Backlink {
  from: NodeOut;
  edge: EdgeOut;
}

export interface VaultState {
  root: string | null;
  entries: VaultEntry[];
  snapshot: VaultSnapshot | null;
  currentPath: string | null;
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
  }>({ path: null, content: "", root: null, dirty: false });
  latest.current = {
    path: state.currentPath,
    content: state.content,
    root: state.root,
    dirty: state.dirty,
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
        setState((s) => ({ ...s, currentPath: path, content, dirty: false }));
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
        let next = { ...state, entries };
        if (state.currentPath === path) {
          const firstMd = entries.find((e) => !e.is_dir);
          next = {
            ...next,
            currentPath: firstMd ? firstMd.path : null,
            content: firstMd ? await ipc.readNote(root, firstMd.path) : "",
          };
        }
        setState(next);
        await refreshIndex(root);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [refreshIndex, state],
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
      saveNow,
      refreshIndex: () => state.root && refreshIndex(state.root),
    },
  };
}

export type VaultActions = ReturnType<typeof useVault>["actions"];
