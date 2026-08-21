/**
 * IPC 层 —— 前端与 Tauri 后端(open-llm-wiki-app)的唯一胶水。
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

/** Agent 记忆接入(B-MCP-ONBOARD):扫描结果里的单个 agent 行。 */
export interface OnboardAgentRow {
  id: string;
  label: string;
  /** 检测到已安装(任一硬证据命中)。 */
  present: boolean;
  evidence: string[];
  hints: string[];
  config_path: string | null;
  note: string;
  /** 无自动接线面(只给 snippet,如 grok)。 */
  manual_only: boolean;
  /** 已接线时:条目里的 command 路径。 */
  wired_command: string | null;
  /** 已接线时:条目里的 vault。 */
  wired_vault: string | null;
  /** 配置文件存在但不可解析(不触碰,展示原因)。 */
  config_error: string | null;
}

export interface OnboardScan {
  home: string;
  /** 自动解析到的 open-llm-wiki-mcp 二进制;null = 需手选。 */
  resolved_binary: string | null;
  agents: OnboardAgentRow[];
  /** 可粘贴进 agent 指引文件的引导文本(只复制,绝不自动写入)。 */
  guidance: string;
}

/** 单 agent 接线/拆线回执。 */
export interface OnboardActionResult {
  id: string;
  ok: boolean;
  message: string;
}

export interface OnboardCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface OnboardSeedReport {
  written: string[];
  skipped: string[];
}

/** core lint_all / app lint_vault 的序列化形态(L1 候选,非判决)。 */
export interface LintNodeRef {
  path: string;
  title: string;
}

/** detect_storage 命令的 DTO(doc 17 G2;snake_case 与后端对齐)。 */
export interface StorageInfo {
  /** "local" | "icloud" | "icloud-managed" | "cloud-other" */
  kind: "local" | "icloud" | "icloud-managed" | "cloud-other";
  cloud_docs_root: string | null;
  /** eviction 采样样本数(0 = 未采样 / 非 iCloud 类)。 */
  evicted_sampled: number;
  evicted_count: number;
}

/** scan_conflicts 命令的 DTO(doc 17 G5:疑似云同步冲突副本对)。 */
export interface ConflictPair {
  base: string;
  copy: string;
}export interface LintFinding {
  kind: string;
  subject: LintNodeRef;
  other: LintNodeRef | null;
}

export interface LintDuplicateNameGroup {
  key: string;
  members: LintNodeRef[];
}

export interface LintReport {
  findings: LintFinding[];
  duplicate_names: LintDuplicateNameGroup[];
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
  /** 媒体索引快照:stats + orphans + missing。 */
  mediaIndex: (root: string, force = false) =>
    call<MediaSnapshot>("media_index", { root, force }),
  /** 某笔记引用的媒体(含断链占位 bytes=0)。 */
  mediaOfNote: (root: string, path: string) =>
    call<MediaMetaOut[]>("media_of_note", { root, path }),
  /**
   * 将附件移入 `.open-llm-wiki/media-trash/` 并更新索引。
   * 需用户确认后调用;delete_note 不自动 GC。
   */
  trashAttachments: (root: string, paths: string[]) =>
    call<number>("trash_attachments", { root, paths }),
  /**
   * 读取落盘的图谱布局快照(B-GRAPH-POS-PERSIST)。无文件 → null。
   * 文件位于 `<root>/.open-llm-wiki/graph-layout.json`。
   */
  readGraphLayout: (root: string) =>
    call<string | null>("read_graph_layout", { root }),
  /** 写入图谱布局快照(创建 `.open-llm-wiki/` 目录)。 */
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
  /** QQL IR → ResultSet(只读 live index)。浏览器 mock 返回空 List。 */
  runQql: (root: string, qql: string) =>
    call<ResultSet>("run_qql", { root, qql }),
  /** L1 结构 lint(只读 live index;候选报告,不改 vault)。 */
  lintVault: (root: string) => call<LintReport>("lint_vault", { root }),
  pickVault: () => call<string | null>("pick_vault", {}),
  /**
   * 在用户 Documents 下创建示例知识库并返回绝对路径(桌面);
   * mock 返回内存示例库根并灌入种子笔记。
   */
  createSampleVault: () => call<string>("create_sample_vault", {}),

  // ── 存储防护(doc 17):iCloud/云盘检测、一键创建、git 闸门覆写、冲突扫描。
  /** 探测 vault 存储类别 + eviction 采样(mock 支持 ?mock-storage= 覆写,供 e2e)。 */
  detectStorage: (root: string) =>
    call<StorageInfo>("detect_storage", { root }),
  /** 在 iCloud Drive(CloudDocs/Open LLM Wiki/)下创建 vault;未登录 → Err。 */
  createIcloudVault: (name: string) =>
    call<string>("create_icloud_vault", { name }),
  /** iCloud Drive 是否可用(欢迎屏据此置灰 iCloud 入口而非点击才失败)。 */
  icloudAvailable: () => call<boolean>("icloud_available", {}),
  /** 覆写 git 自动化闸门(icloud vault 默认关;显式 allowed=true 恢复)。 */
  setGitAutomation: (root: string, allowed: boolean) =>
    call<void>("set_git_automation", { root, allowed }),
  /** 扫描疑似冲突副本(`X N.md` 与 `X.md` 并存);只提示,绝不自动处理。 */
  scanConflicts: (root: string) =>
    call<ConflictPair[]>("scan_conflicts", { root }),
  /** 在系统文件管理器中显示笔记(macOS Finder / Windows 资源管理器 / Linux)。桌面专用。 */
  revealInFinder: (root: string, path: string) =>
    call<void>("reveal_in_finder", { root, path }),
  /** 用系统浏览器打开 https 链接(问题反馈等)。浏览器 mock 走 window.open。 */
  openExternalUrl: async (url: string) => {
    if (!isTauri) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await invoke("open_external_url", { url });
  },

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

  // ── Agent 记忆接入(B-MCP-ONBOARD):桌面专用(mock 模式下面板展示占位提示)。
  //   与 CLI `open-llm-wiki-mcp setup/doctor/init` 共享同一套探测/接线/播种逻辑。
  /** 探测本地 agent + 已接线状态 + 自动解析的二进制路径。 */
  onboardScan: () => call<OnboardScan>("onboard_scan", {}),
  /** 接入所选 agent(写各家 MCP 配置;备份 + 原子写护栏在后端)。 */
  onboardApply: (
    binary: string,
    vault: string,
    agentIds: string[],
    dryRun = false,
  ) =>
    call<OnboardActionResult[]>("onboard_apply", {
      binary,
      vault,
      agentIds,
      dryRun,
    }),
  /** 拆线所选 agent(只删各家配置里的 open-llm-wiki 条目)。 */
  onboardRemove: (agentIds: string[]) =>
    call<OnboardActionResult[]>("onboard_remove", { agentIds }),
  /** 接线健康诊断(与 `open-llm-wiki-mcp doctor` 同一份检查)。 */
  onboardDoctor: (vault: string, binary?: string | null) =>
    call<OnboardCheck[]>("onboard_doctor", { vault, binary: binary ?? null }),
  /** 播种 wiki-starter 模板(force 合并,永不覆盖已有文件)。 */
  onboardInit: (dir: string, force = false) =>
    call<OnboardSeedReport>("onboard_init", { dir, force }),
  /** 仅给当前工作 vault 补装 wiki-ingest skill(提炼所需;不写整套模板,永不覆盖)。 */
  onboardInstallSkill: (dir: string) =>
    call<OnboardSeedReport>("onboard_install_skill", { dir }),
  /** 引导文本(粘贴进 agent 指引文件;UI 只复制,绝不代写)。 */
  onboardGuidance: () => call<string>("onboard_guidance", {}),
  /** 重新解析 open-llm-wiki-mcp 二进制路径。 */
  onboardResolveBinary: () => call<string | null>("onboard_resolve_binary", {}),
  /** 系统文件对话框手选 open-llm-wiki-mcp 二进制。 */
  onboardPickBinary: () => call<string | null>("onboard_pick_binary", {}),

  /** 浏览器 dev 用的标志:为 true 时 UI 应提示"当前为 mock 模式"。 */
  isMock: () => !isTauri,
};
