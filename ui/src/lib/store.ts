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
import {
  ipc,
  type ConflictPair,
  type EdgeOut,
  type NodeOut,
  type StorageInfo,
  type VaultEntry,
  type VaultSnapshot,
} from "./ipc";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { tabReduce } from "./tabs";
import {
  emptyHistory,
  navigateBack,
  navigateForward,
  recordNavigation,
  type NavHistory,
} from "./nav-history";
import { applyTemplate, defaultTemplate } from "./template";
import { removeFrontmatterKey, setFrontmatterValue } from "./frontmatter";
import { buildAiContext } from "./ai-context";
import { pickRestorableNote, readLastPath, writeLastRoot } from "./last-note";
import { readGitAutomation } from "./storage-notice";
import { resolveMoveTarget } from "./move-path";
import {
  canCommitWatchResult,
  mergeWatchPaths,
  shouldForceHeal,
  takeWatchBatch,
} from "./vault-watch";

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
  /** 存储类别探测(doc 17 G2;null = 未探测/不支持)。 */
  storage: StorageInfo | null;
  /** 疑似云同步冲突副本对(doc 17 G5)。 */
  conflicts: ConflictPair[];
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
  storage: null,
  conflicts: [],
};

const SAVE_DEBOUNCE_MS = 800;
const REINDEX_DEBOUNCE_MS = 1500;
const SAVE_FLASH_MS = 1200;

export function useVault() {
  const [state, setState] = useState<VaultState>(INITIAL);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reindexTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 文件监听(Tauri 桌面):vault-changed → 路径并集 debounce → apply / force 自愈。
  const watchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  /** debounce 窗内路径并集(跨 emit 共享,切 vault 时清空)。 */
  const watchPendingRef = useRef<Set<string>>(new Set());
  /** 单调世代:每次调度 apply 递增;完成时过期则丢弃 setState。 */
  const watchGenRef = useRef(0);
  /**
   * 最近一次 rename/move 的路径别名(旧→新,单条)。视图卸载 flush 若在改名后
   * 迟到,重定向到新路径,避免向已改名的旧路径写盘"复活"旧文件。
   */
  const pathAliasRef = useRef<Map<string, string>>(new Map());

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

  /**
   * 刷新索引快照。
   * - force=false:投影 live(写盘后 live 已路径级更新,无需 WalkDir)
   * - force=true:WalkDir 全量自愈(open vault / 手动 refresh / watcher 失败)
   * setState 带 root 守卫:异步返回时若已切 vault 则丢弃。
   */
  const refreshIndex = useCallback(async (root: string, force = false) => {
    try {
      const snap = await ipc.indexVault(root, force);
      setState((s) => (s.root !== root ? s : { ...s, snapshot: snap }));
    } catch (e) {
      setState((s) => (s.root !== root ? s : { ...s, error: String(e) }));
    }
  }, []);

  /** 停前端 watcher:清 timer、unlisten、pending、作废 in-flight gen。 */
  const stopWatch = useCallback(() => {
    if (watchTimer.current) {
      clearTimeout(watchTimer.current);
      watchTimer.current = null;
    }
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    watchPendingRef.current.clear();
    // 作废所有未完成的 apply/setState。
    watchGenRef.current += 1;
  }, []);

  const saveNow = useCallback(async () => {
    const { path, content, root, dirty } = latest.current;
    if (!path || !root) return;
    // 内容没变不写盘:避免误触发把 mtime 顶上去、第二栏跳顶。
    if (!dirty) return;
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

  /**
   * 刷新冲突副本扫描(doc 17 G5):watcher 批次落定后跟着刷一遍。
   * 失败静默(提示卡缺一轮不致丢数据)。
   */
  const refreshConflicts = useCallback(async (root: string) => {
    try {
      const pairs = await ipc.scanConflicts(root);
      setState((s) => (s.root !== root ? s : { ...s, conflicts: pairs }));
    } catch {
      /* 防护类探测失败不阻塞主流程 */
    }
  }, []);

  const openVault = useCallback(
    async (root: string): Promise<boolean> => {
      try {
        // §9.6 关闭善后:切换到不同 vault 时,先终止旧 vault 的活动 agent
        // (其 cwd 绑定旧 root,否则会写错地方 / 泄漏子进程)。无活动 agent 时为 no-op。
        if (state.root && state.root !== root) {
          try {
            await invoke<void>("agent_stop");
          } catch {
            /* 忽略:无活动 agent 或已退出 */
          }
        }
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
        // force:打开 vault 时全量 WalkDir 一次,建立 live index。
        const snap = await ipc.indexVault(root, true);
        // doc 17 G2/G5:存储探测 + 冲突扫描(防护类,失败不阻塞打开)。
        let storage: StorageInfo | null = null;
        let conflicts: ConflictPair[] = [];
        try {
          storage = await ipc.detectStorage(root);
          conflicts = await ipc.scanConflicts(root);
        } catch {
          /* 老 backend / mock 不支持时静默降级 */
        }
        // 恢复用户的 git 自动化覆写(曾对 icloud vault 显式开启过 → 重新告知后端)。
        if (
          storage?.kind === "icloud" &&
          typeof window !== "undefined" &&
          readGitAutomation((k) => window.localStorage.getItem(k), root) === true
        ) {
          void ipc.setGitAutomation(root, true).catch(() => {});
        }
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
          storage,
          conflicts,
        });
        // 记下成功打开的根,下次启动恢复(Obsidian 同款行为)。
        writeLastRoot(root);
        // Tauri 桌面:外部改动 → debounce 并集路径 → apply;失败则 force 自愈。
        // 切 vault 前先 stopWatch(清 timer + 作废 gen),防 vault A 定时器写进 B。
        if (!ipc.isMock()) {
          stopWatch();
          await ipc.watchVault(root);
          unlistenRef.current = await listen<string[]>("vault-changed", (ev) => {
            const incoming = Array.isArray(ev.payload) ? ev.payload : [];
            mergeWatchPaths(watchPendingRef.current, incoming);
            if (watchTimer.current) clearTimeout(watchTimer.current);
            watchTimer.current = setTimeout(() => {
              // 每批独立世代:后完成的旧批不得覆盖新批。
              const myGen = (watchGenRef.current += 1);
              const expectedRoot = root;
              void (async () => {
                const batch = takeWatchBatch(watchPendingRef.current);
                let applyFailed = false;
                try {
                  if (!shouldForceHeal(batch, false)) {
                    const snap = await ipc.applyVaultChanges(expectedRoot, batch);
                    if (
                      !canCommitWatchResult(
                        myGen,
                        watchGenRef.current,
                        expectedRoot,
                        latest.current.root,
                      )
                    ) {
                      return;
                    }
                    setState((s) =>
                      s.root !== expectedRoot
                        ? s
                        : { ...s, snapshot: snap },
                    );
                    const entries = await ipc.listVault(expectedRoot);
                    if (
                      !canCommitWatchResult(
                        myGen,
                        watchGenRef.current,
                        expectedRoot,
                        latest.current.root,
                      )
                    ) {
                      return;
                    }
                    setState((s) =>
                      s.root !== expectedRoot ? s : { ...s, entries },
                    );
                    void refreshConflicts(expectedRoot);
                    return;
                  }
                } catch (e) {
                  applyFailed = true;
                  if (
                    canCommitWatchResult(
                      myGen,
                      watchGenRef.current,
                      expectedRoot,
                      latest.current.root,
                    )
                  ) {
                    setState((s) =>
                      s.root !== expectedRoot
                        ? s
                        : { ...s, error: String(e) },
                    );
                  }
                }
                // 空批 / apply 失败 → force 全量(用户也可 actions.refreshIndex force)。
                if (shouldForceHeal(batch, applyFailed)) {
                  if (
                    !canCommitWatchResult(
                      myGen,
                      watchGenRef.current,
                      expectedRoot,
                      latest.current.root,
                    )
                  ) {
                    return;
                  }
                  try {
                    await refreshIndex(expectedRoot, true);
                    if (
                      !canCommitWatchResult(
                        myGen,
                        watchGenRef.current,
                        expectedRoot,
                        latest.current.root,
                      )
                    ) {
                      return;
                    }
                    const entries = await ipc.listVault(expectedRoot);
                    if (
                      canCommitWatchResult(
                        myGen,
                        watchGenRef.current,
                        expectedRoot,
                        latest.current.root,
                      )
                    ) {
                      setState((s) =>
                        s.root !== expectedRoot ? s : { ...s, entries },
                      );
                      void refreshConflicts(expectedRoot);
                    }
                  } catch (e) {
                    if (
                      canCommitWatchResult(
                        myGen,
                        watchGenRef.current,
                        expectedRoot,
                        latest.current.root,
                      )
                    ) {
                      setState((s) =>
                        s.root !== expectedRoot
                          ? s
                          : { ...s, error: String(e) },
                      );
                    }
                  }
                }
              })();
            }, 500);
          });
        }
        return true;
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
        return false;
      }
    },
    [refreshIndex, refreshConflicts, stopWatch],
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
      if (latest.current.content === next) return;
      setState((s) => (s.content === next ? s : { ...s, content: next, dirty: true }));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveNow();
      }, SAVE_DEBOUNCE_MS);
    },
    [saveNow],
  );

  /**
   * 带所有权的回写:编辑器视图(富文本/画布/表格)卸载 flush 专用。
   * path+root 仍是当前笔记 → 走 setContent(共享槽 + 防抖落盘);
   * 否则(stale flush:切笔记/切 tab/切 vault 后迟到)→ 定向写回视图自己的
   * (root, path)(经 rename 别名重定向),不碰共享槽——否则旧笔记内容会污染
   * 新笔记的 content 槽并在防抖到期后落盘到错误路径(跨笔记写坏,2026-08-15 修复)。
   */
  const writeScoped = useCallback(
    (path: string | null, root: string | null, next: string) => {
      if (!path || !root) return;
      if (path === latest.current.path && root === latest.current.root) {
        setContent(next);
        return;
      }
      const target = pathAliasRef.current.get(path) ?? path;
      void (async () => {
        try {
          await ipc.writeNote(root, target, next);
          if (reindexTimer.current) clearTimeout(reindexTimer.current);
          reindexTimer.current = setTimeout(() => {
            void refreshIndex(root);
          }, REINDEX_DEBOUNCE_MS);
        } catch (e) {
          setState((s) => ({ ...s, error: String(e) }));
        }
      })();
    },
    [setContent, refreshIndex],
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
   * 新建一张画布(F-CANVAS / Excalidraw):写空 `.canvas` 文件并打开。
   * 内容由 CanvasView 防抖回写 OpenLlmWikiCanvas JSON;这里只负责落空壳。
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

  /**
   * 新建表格(F-SHEET):写默认 `.sheet` JSON 并打开。
   * 与 canvas 同路径策略,不进笔记索引。
   */
  const createSheet = useCallback(
    async (name: string) => {
      const root = latest.current.root;
      if (!root) return;
      const { emptySheetContent } = await import("./sheet");
      const path = name.toLowerCase().endsWith(".sheet") ? name : `${name}.sheet`;
      try {
        await ipc.createNote(root, path, emptySheetContent());
        const entries = await ipc.listVault(root);
        navHistory.current = recordNavigation(
          navHistory.current,
          latest.current.path,
          path,
        );
        bumpNav();
        const content = emptySheetContent();
        setState((s) => ({
          ...s,
          entries,
          currentPath: path,
          openPaths: s.openPaths.includes(path)
            ? s.openPaths
            : [...s.openPaths, path],
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
        // 迟到的卸载 flush 仍携带旧路径 → 别名重定向到新路径,防旧文件复活。
        pathAliasRef.current = new Map([[from, to]]);
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
   * 移动笔记到目标目录(拖拽到文件夹)。文件名不变;空 targetDir = vault 根。
   * 复用 rename_note IPC(后端会建父目录 + git 自动提交)。
   */
  const moveNote = useCallback(
    async (from: string, targetDir: string): Promise<string | null> => {
      const root = latest.current.root;
      if (!root) return null;
      const to = resolveMoveTarget(from, targetDir);
      if (!to) return null;
      try {
        if (latest.current.dirty && latest.current.path === from) await saveNow();
        await ipc.renameNote(root, from, to);
        pathAliasRef.current = new Map([[from, to]]);
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
      // H1 写盘后再刷一次索引:renameNote 那次 reindex 时 body 仍是旧 H1(占位),
      // 标题会停留在「未命名」;此处让列表标题跟上新名。
      await refreshIndex(root);
    },
    [renameNote, refreshIndex],
  );

  /**
   * 设置(或清除,传 null)某笔记的 frontmatter `status`(列表行右键「切状态」)。
   * 当前笔记直接用内存 content(保留未落盘的正文编辑),其它笔记读盘;合并 status 后
   * 落盘 + 刷新索引。写前取消挂起的正文 autosave,避免与之竞争同一文件。
   */
  const setNoteStatus = useCallback(
    async (path: string, status: string | null) => {
      const root = latest.current.root;
      if (!root) return;
      try {
        const isCurrent = latest.current.path === path;
        const prev = isCurrent ? latest.current.content : await ipc.readNote(root, path);
        const next = status
          ? setFrontmatterValue(prev, "status", status)
          : removeFrontmatterKey(prev, "status");
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        await ipc.writeNote(root, path, next);
        if (isCurrent) setState((s) => ({ ...s, content: next, dirty: false }));
        await refreshIndex(root);
      } catch (e) {
        setState((s) => ({ ...s, error: String(e) }));
      }
    },
    [refreshIndex],
  );

  // 卸载时冲刷(含 watcher timer/gen,防泄漏与串 vault)。
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (reindexTimer.current) clearTimeout(reindexTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      stopWatch();
    };
  }, [stopWatch]);

  /** 清除错误态(错误横幅关闭时调用)。 */
  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  /**
   * 复制为 AI 上下文(F-AI 读侧桥接):把当前笔记 + 其外向链接命中的邻居正文,拼成
   * 一段 markdown 写入剪贴板,便于粘贴给任意 LLM。邻居正文经 readNote 现取;mock 模式
   * 下同样可用(内存 Map)。完整 MCP server(让 agent 反向读写 vault)见路线图。
   * 返回拼好的 markdown(剪贴板被禁用时仍返回,便于降级)。
   */
  /** 构造「当前笔记 + 相关笔记」的 LLM 友好 markdown(复用 ai-context.ts)。
   *  不写剪贴板;copyAiContext 与应用内 Agent 的 `@`-context 共用此纯取数逻辑。
   *  - 传 paths(@-context 选择器,候选=编辑器打开的标签):只附勾选的笔记,直接按
   *    路径读正文(不再限于当前笔记的外向链接邻居);当前笔记恒附,不受过滤。
   *  - 不传(复制到剪贴板的旧语义):当前笔记 + 其外向链接命中的全部邻居。 */
  const buildAiContextMd = useCallback(
    async (paths?: string[]): Promise<string | null> => {
      const { root, path, content } = latest.current;
      const snap = state.snapshot;
      if (!root || !path || !snap) return null;
      const cur = snap.nodes.find((n) => n.path === path) ?? null;
      const neighbors = [];
      if (paths) {
        for (const p of paths) {
          if (p === path) continue; // 当前笔记恒附,走 current 通道
          const n = snap.nodes.find((x) => x.path === p);
          const c = await ipc.readNote(root, p);
          neighbors.push({ path: p, title: n?.title ?? p, content: c });
        }
      } else {
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
        for (const id of neighborIds) {
          const n = snap.nodes.find((x) => x.id === id);
          if (!n) continue;
          const c = await ipc.readNote(root, n.path);
          neighbors.push({ path: n.path, title: n.title, content: c });
        }
      }
      return buildAiContext({
        current: { path, title: cur?.title ?? path, content },
        neighbors,
      });
    },
    [state.snapshot],
  );

  /**
   * §25:@-context 选择器的候选列表。候选与**编辑器顶部标签栏同源**:用户打开过的
   * 文件(openPaths)即候选,按标签顺序;当前笔记若不在标签里则置顶(恒附)。
   * 不预取正文。
   */
  const contextCandidates = useCallback(async (): Promise<
    import("./ai-context").ContextCandidate[]
  > => {
    const { path, openPaths } = latest.current;
    const snap = state.snapshot;
    if (!snap) return [];
    const paths: string[] = [];
    if (path && !openPaths.includes(path)) paths.push(path);
    for (const p of openPaths) {
      if (!paths.includes(p)) paths.push(p);
    }
    return paths.map((p) => {
      const n = snap.nodes.find((x) => x.path === p);
      return {
        path: p,
        title: n?.title ?? p.split("/").pop() ?? p,
        isCurrent: p === path,
      };
    });
  }, [state.snapshot]);

  const copyAiContext = useCallback(async (): Promise<string | null> => {
    const md = await buildAiContextMd();
    if (md) {
      try {
        await navigator.clipboard.writeText(md);
      } catch {
        // 剪贴板被禁用(无 https / 权限)时静默;文本仍返回,调用方可降级提示。
      }
    }
    return md;
  }, [buildAiContextMd]);

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
      writeScoped,
      createNote,
      createNoteFromTemplate,
      createDraftNote,
      createCanvas,
      createSheet,
      deleteNote,
      renameNote,
      moveNote,
      commitDraftRename,
      setNoteStatus,
      restoreNote,
      closeTab,
      closeOthers,
      closeAllTabs,
      reorderTab,
      cycleTab,
      clearError,
      saveNow,
      copyAiContext,
      buildAiContextMd,
      contextCandidates,
      // 手动/自愈刷新:force=true 全量 WalkDir,覆盖 silent 漏事件(无需 re-open)。
      // 保存后的节流 refresh 仍走 refreshIndex(root, false) 投影 live。
      refreshIndex: () => state.root && refreshIndex(state.root, true),
    },
  };
}

export type VaultActions = ReturnType<typeof useVault>["actions"];
