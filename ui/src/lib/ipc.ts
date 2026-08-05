/**
 * IPC 层 —— 前端与 Tauri 后端(openobs-app)的唯一胶水。
 *
 * 设计:
 * - 在 Tauri webview 内,`window.__TAURI_INTERNALS__` 由运行时注入,据此分流。
 * - 不在 Tauri(纯 `vite dev` 浏览器)时,委托给 `mock.ts` 的内存后端,使整条 UI
 *   可在浏览器里独立开发/预览,无需启动 Rust。采用 mock-tauri 模式。
 *
 * 命令签名与 `app/src-tauri/src/lib.rs` 的 `#[tauri::command]` 一一对应,DTO 类型
 * 也与后端 serde 序列化字段对齐(包括把 Rust `type_: Option<String>` 还原成 `type`)。
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import * as mock from "./mock";

/** Tauri 2 运行时注入的全局标记。 */
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface VaultEntry {
  path: string;
  name: string;
  is_dir: boolean;
}

export interface NodeOut {
  id: number;
  path: string;
  title: string;
  type: string | null;
  tags: string[];
  /** frontmatter `status`(软状态;可空)。 */
  status: string | null;
  /** frontmatter `created`(字符串,通常 YYYY-MM-DD;可空)。 */
  created: string | null;
  /** 文件 mtime,unix 毫秒(读取失败时后端回退 0)。 */
  modified: number;
  /** 正文单行预览(已去 frontmatter 与开头 H1,≤200 字符)。 */
  preview: string;
}

export interface EdgeOut {
  from: number;
  to: number | null;
  unresolved: string | null;
  kind: "wiki" | "relation";
  relation: string | null;
  anchor: string | null;
}

export interface VaultSnapshot {
  root: string;
  nodes: NodeOut[];
  edges: EdgeOut[];
}

/** QQL 表格行:core 的 `Option<Vec<Option<String>>>` 序列化形态。 */
export interface QqlRow {
  id: number;
  fields: (string | null)[] | null;
}

/** group_by 分组行。 */
export interface GroupRow {
  key: string;
  count: number;
  ids: number[];
}

/**
 * QQL 结果集 —— 对齐 core 的 `ResultSet` 枚举(serde 外标签)。
 * 形态由 `RENDER` 决定:List / Table / Count / Groups / Sum。
 */
export type ResultSet =
  | { List: number[] }
  | { Table: QqlRow[] }
  | { Count: number }
  | { Groups: GroupRow[] }
  | { Sum: number }
  | { Histogram: GroupRow[] };

export interface SearchHit {
  id: number;
  score: number;
}

/** 媒体索引条目(对齐 core MediaMeta + refcount)。 */
export interface MediaMetaOut {
  path: string;
  kind: string;
  bytes: number;
  mtime_ms: number;
  refcount: number;
}

export interface MediaStatsOut {
  files: number;
  notes_with_media: number;
  refs: number;
  orphans: number;
  missing: number;
}

export interface MediaSnapshot {
  stats: MediaStatsOut;
  /** 全库媒体路径(短名 resolve)。 */
  files: string[];
  orphans: MediaMetaOut[];
  missing: string[];
}

/**
 * git 历史中「已删除」的 `.md`:工作区已不存在、但版本库历史里仍有。
 * 后端从 `git log --diff-filter=D` 投影;title 由 path 推(去 `.md`)。
 * 归档视图据此列出可还原的已删笔记。删除/还原统一走 git,无 `.trash/` 平行机制。
 */
export interface DeletedNote {
  path: string;
  title: string;
  /** 最近一次删除该文件的提交 hash。 */
  commit: string;
  /** 删除日期(YYYY-MM-DD,取自 git author date)。 */
  deleted_at: string;
}

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(cmd, args);
  }
  return mock.handle<T>(cmd, args);
}

// ───────────────────────── 命令封装 ─────────────────────────

export const ipc = {
  listVault: (root: string) =>
    call<VaultEntry[]>("list_vault", { root }),
  readNote: (root: string, path: string) =>
    call<string>("read_note", { root, path }),
  writeNote: (root: string, path: string, content: string) =>
    call<void>("write_note", { root, path, content }),
  createNote: (root: string, path: string, content: string) =>
    call<void>("create_note", { root, path, content }),
  /**
   * 写入附件(图片等二进制)。`bytesBase64` 为标准 base64,或 data URL。
   * 不进笔记索引;阅读侧用 `resolveMediaUrl` 取可加载 URL。
   */
  saveAttachment: (root: string, path: string, bytesBase64: string) =>
    // Tauri 2 将 Rust `bytes_base64` 暴露为 JS camelCase `bytesBase64`。
    call<void>("save_attachment", {
      root,
      path,
      bytesBase64,
    }),
  /**
   * 磁盘/mock 上相对路径是否已有文件(unique 路径分配用)。
   * 桌面走 `attachment_exists`;mock 查内存 Map。
   */
  attachmentExistsAsync: async (
    root: string | null,
    relPath: string,
  ): Promise<boolean> => {
    const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!isTauri) {
      return mock.attachmentExists(rel);
    }
    if (!root) return false;
    try {
      return await call<boolean>("attachment_exists", { root, path: rel });
    } catch {
      return false;
    }
  },
  /**
   * 列出 vault 内图片附件相对路径(默认扫 `attachments/` 子树)。
   * 供媒体清单 / 孤儿检测;不进笔记 live index。
   */
  listAttachments: (root: string, dir?: string | null) =>
    call<string[]>("list_attachments", {
      root,
      dir: dir ?? null,
    }),
  /** 媒体索引快照:stats + orphans + missing。 */
  mediaIndex: (root: string, force = false) =>
    call<MediaSnapshot>("media_index", { root, force }),
  /** 某笔记引用的媒体(含断链占位 bytes=0)。 */
  mediaOfNote: (root: string, path: string) =>
    call<MediaMetaOut[]>("media_of_note", { root, path }),
  /** 引用该附件的笔记路径。 */
  mediaUsedBy: (root: string, path: string) =>
    call<string[]>("media_used_by", { root, path }),
  /**
   * 将附件移入 `.openobsidian/media-trash/` 并更新索引。
   * 需用户确认后调用;delete_note 不自动 GC。
   */
  trashAttachments: (root: string, paths: string[]) =>
    call<number>("trash_attachments", { root, paths }),
  /**
   * 读取落盘的图谱布局快照(B-GRAPH-POS-PERSIST)。无文件 → null。
   * 文件位于 `<root>/.openobsidian/graph-layout.json`。
   */
  readGraphLayout: (root: string) =>
    call<string | null>("read_graph_layout", { root }),
  /** 写入图谱布局快照(创建 `.openobsidian/` 目录)。 */
  saveGraphLayout: (root: string, json: string) =>
    call<void>("save_graph_layout", { root, json }),
  /**
   * 把 vault 相对路径解析为 webview 可加载的图片 URL(同步)。
   * Tauri:优先 `convertFileSrc`(需 assetProtocol);mock:data URL。
   */
  resolveMediaUrl: (root: string, relPath: string): string => {
    const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!isTauri) {
      return mock.resolveAttachmentUrl(rel);
    }
    const abs = root.endsWith("/") || root.endsWith("\\")
      ? `${root}${rel}`
      : `${root}/${rel}`;
    return convertFileSrc(abs);
  },
  /**
   * 异步解析:读盘为 data URL,BlockNote / 预览可依赖(不靠 asset 协议是否生效)。
   */
  resolveMediaUrlAsync: async (
    root: string,
    relPath: string,
  ): Promise<string> => {
    const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!isTauri) {
      return mock.resolveAttachmentUrl(rel);
    }
    try {
      return await call<string>("read_attachment_data_url", {
        root,
        path: rel,
      });
    } catch {
      return ipc.resolveMediaUrl(root, rel);
    }
  },
  /**
   * 同步占用检查:仅 mock 内存有效;桌面恒 false。
   * 新代码请用 `attachmentExistsAsync(root, path)`。
   */
  attachmentExists: (relPath: string): boolean => {
    if (isTauri) return false;
    return mock.attachmentExists(relPath);
  },
  deleteNote: (root: string, path: string) =>
    call<void>("delete_note", { root, path }),
  renameNote: (root: string, from: string, to: string) =>
    call<void>("rename_note", { root, from, to }),
  /**
   * 索引快照。`force=true` 强制 WalkDir 全量加载(open vault / 自愈);
   * 默认走内存 live index(路径 delta 后的 build_from_map,无全库扫盘)。
   */
  indexVault: (root: string, force = false) =>
    call<VaultSnapshot>("index_vault", { root, force }),
  /**
   * 路径级增量:把 `paths` 从磁盘读入/删除进 live index,返回新快照。
   * watcher 的 vault-changed payload 走此入口。
   */
  applyVaultChanges: (root: string, paths: string[]) =>
    call<VaultSnapshot>("apply_vault_changes", { root, paths }),
  searchNotes: (root: string, query: string) =>
    call<SearchHit[]>("search_notes", { root, query }),
  pickVault: () => call<string | null>("pick_vault", {}),
  /** 在系统文件管理器中显示笔记(macOS Finder / Windows 资源管理器 / Linux)。桌面专用。 */
  revealInFinder: (root: string, path: string) =>
    call<void>("reveal_in_finder", { root, path }),

  // ── git(F-GIT):返回 git 原始 stdout,前端 `git-parse.ts` 解析。
  //   仅在 Tauri 桌面 app 打开真正的 git 仓库时生效;mock 模式下不可用。
  gitStatusRaw: (root: string) => call<string>("git_status_raw", { root }),
  gitLogRaw: (root: string, limit = 50) =>
    call<string>("git_log_raw", { root, limit }),
  gitCommit: (root: string, message: string) =>
    call<string>("git_commit", { root, message }),
  /** `git pull --no-rebase`;冲突时 Err,再刷 status 看 UU。 */
  gitPull: (root: string) => call<string>("git_pull", { root }),
  /** `git push` 当前分支。 */
  gitPush: (root: string) => call<string>("git_push", { root }),

  // ── 归档并入 git(删除/还原一体化):删除即 git 提交,还原从历史检出。
  //   工作区无 `.trash/`;唯一真相源是版本库。结构操作(建/删/改名)后端自动提交。
  /** 是否已是 git 仓库(决定归档视图渲染「历史」还是「初始化」空态)。 */
  gitIsRepo: (root: string) => call<boolean>("git_is_repo", { root }),
  /** 列出 git 历史中「已删除」的 `.md`(可还原)。 */
  gitDeletedNotes: (root: string) =>
    call<DeletedNote[]>("git_deleted_notes", { root }),
  /** 从最近删除提交还原某 path(`git checkout <hash>^ -- <path>` + add)。 */
  gitRestoreNote: (root: string, path: string) =>
    call<string>("git_restore_note", { root, path }),
  /** `git init` + 初始提交(归档空态的「初始化 git」按钮)。 */
  gitInit: (root: string) => call<void>("git_init", { root }),

  // ── 文件监听(Tauri 桌面):notify 监听 vault,debounce 后 emit "vault-changed",
  //   前端 listen → 节流全量 refresh。mock/浏览器不监听(无 fs)。
  watchVault: (root: string) => call<void>("watch_vault", { root }),
  unwatchVault: () => call<void>("unwatch_vault", {}),

  /** 浏览器 dev 用的标志:为 true 时 UI 应提示"当前为 mock 模式"。 */
  isMock: () => !isTauri,
};
