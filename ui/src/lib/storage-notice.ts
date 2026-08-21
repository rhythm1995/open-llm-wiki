/**
 * storage-notice —— 存储提示与 git 自动化偏好的持久化键(doc 17)。
 *
 * 纯逻辑 + 显式 Storage 注入(与 last-note.ts 同风格):
 * - 存储横幅一次性关闭标记(per root);
 * - git 自动化覆写(per root;null = 未覆写,遵守后端默认:icloud 关、其余开);
 * - 冲突副本"忽略此项"清单(per root,存 copy 路径)。
 */
import type { ConflictPair } from "./ipc";

export type StorageKindStr = "local" | "icloud" | "icloud-managed" | "cloud-other";

/** detect_storage 命令的 DTO(与 app storage.rs StorageInfo 对齐,snake_case)。 */
export interface StorageInfo {
  kind: StorageKindStr;
  cloud_docs_root: string | null;
  evicted_sampled: number;
  evicted_count: number;
}

const STORAGE_NOTICE_PREFIX = "open-llm-wiki.storageNotice.";
const EVICTION_DISMISSED_PREFIX = "open-llm-wiki.storageNoticeEvicted.";
const GIT_AUTOMATION_PREFIX = "open-llm-wiki.gitAutomation.";
const CONFLICT_IGNORE_PREFIX = "open-llm-wiki.conflictIgnored.";

export type StorageGet = (key: string) => string | null;
export type StorageSet = (key: string, value: string) => void;

/** root → 稳定短哈希(仅作 localStorage 键名)。 */
export function rootHash(root: string): string {
  // FNV-1a 32-bit;>>> 0 归一为无符号。
  let h = 0x811c9dc5;
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** 是否云同步类(local 以外都要提示)。 */
export function isCloudKind(kind: StorageKindStr): boolean {
  return kind !== "local";
}

/** 是否 iCloud 托管(显式 iCloud 或 Desktop & Documents 同步)→ eviction 探测适用。 */
export function isIcloudKind(kind: StorageKindStr): boolean {
  return kind === "icloud" || kind === "icloud-managed";
}

/** eviction 比例(0–1);未采样返回 null。 */
export function evictedRatio(info: StorageInfo | null): number | null {
  if (!info || info.evicted_sampled <= 0) return null;
  return info.evicted_count / info.evicted_sampled;
}

// ── 存储横幅一次性关闭 ──
// 两条独立记忆:主横幅(类别提示)一次性;eviction 提示按"已关闭时的计数"记忆,
// 未下载计数上涨超过已关闭值时重新出现(doc 17 §7:"触发 G4 时可再出现一次")。

export function readStorageNoticeDismissed(
  getItem: StorageGet,
  root: string,
): boolean {
  return getItem(STORAGE_NOTICE_PREFIX + rootHash(root)) === "1";
}

export function writeStorageNoticeDismissed(
  setItem: StorageSet,
  root: string,
): void {
  setItem(STORAGE_NOTICE_PREFIX + rootHash(root), "1");
}

/** 关闭横幅时的 eviction 计数(未关闭过 → 0)。 */
export function readEvictionDismissedCount(
  getItem: StorageGet,
  root: string,
): number {
  const v = getItem(EVICTION_DISMISSED_PREFIX + rootHash(root));
  const n = v == null ? Number.NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function writeEvictionDismissedCount(
  setItem: StorageSet,
  root: string,
  count: number,
): void {
  setItem(EVICTION_DISMISSED_PREFIX + rootHash(root), String(Math.max(0, count)));
}

// ── git 自动化覆写(null = 未覆写) ──

export function readGitAutomation(
  getItem: StorageGet,
  root: string,
): boolean | null {
  const v = getItem(GIT_AUTOMATION_PREFIX + rootHash(root));
  return v === "1" ? true : v === "0" ? false : null;
}

export function writeGitAutomation(
  setItem: StorageSet,
  root: string,
  allowed: boolean,
): void {
  setItem(GIT_AUTOMATION_PREFIX + rootHash(root), allowed ? "1" : "0");
}

// ── 冲突副本忽略清单 ──

export function readIgnoredConflicts(
  getItem: StorageGet,
  root: string,
): string[] {
  const raw = getItem(CONFLICT_IGNORE_PREFIX + rootHash(root));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

export function ignoreConflict(
  getItem: StorageGet,
  setItem: StorageSet,
  root: string,
  copy: string,
): void {
  const list = readIgnoredConflicts(getItem, root);
  if (!list.includes(copy)) list.push(copy);
  setItem(CONFLICT_IGNORE_PREFIX + rootHash(root), JSON.stringify(list));
}

/** 过滤掉被忽略的冲突对(保持原序)。 */
export function visibleConflicts(
  pairs: ConflictPair[],
  ignored: string[],
): ConflictPair[] {
  const set = new Set(ignored);
  return pairs.filter((p) => !set.has(p.copy));
}

/** 后端错误串 → 展示文案:OLW_TIMEOUT 前缀(G6 读超时)映射为友好提示,其余原样。 */
export function mapStorageError(err: string, timeoutMsg: string): string {
  return err.startsWith("OLW_TIMEOUT:") ? timeoutMsg : err;
}
