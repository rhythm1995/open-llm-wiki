/**
 * IPC 层 —— 前端与 Tauri 后端(openobs-app)的唯一胶水。
 *
 * 设计:
 * - 在 Tauri webview 内,`window.__TAURI_INTERNALS__` 由运行时注入,据此分流。
 * - 不在 Tauri(纯 `vite dev` 浏览器)时,委托给 `mock.ts` 的内存后端,使整条 UI
 *   可在浏览器里独立开发/预览,无需启动 Rust。这是 Tolaria "mock-tauri" 模式的复刻。
 *
 * 命令签名与 `app/src-tauri/src/lib.rs` 的 `#[tauri::command]` 一一对应,DTO 类型
 * 也与后端 serde 序列化字段对齐(包括把 Rust `type_: Option<String>` 还原成 `type`)。
 */
import { invoke } from "@tauri-apps/api/core";
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
  | { Sum: number };

export interface SearchHit {
  id: number;
  score: number;
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
  deleteNote: (root: string, path: string) =>
    call<void>("delete_note", { root, path }),
  renameNote: (root: string, from: string, to: string) =>
    call<void>("rename_note", { root, from, to }),
  indexVault: (root: string) =>
    call<VaultSnapshot>("index_vault", { root }),
  runQql: (root: string, qql: string) =>
    call<ResultSet>("run_qql", { root, qql }),
  searchNotes: (root: string, query: string) =>
    call<SearchHit[]>("search_notes", { root, query }),
  pickVault: () => call<string | null>("pick_vault", {}),

  /** 浏览器 dev 用的标志:为 true 时 UI 应提示"当前为 mock 模式"。 */
  isMock: () => !isTauri,
};
