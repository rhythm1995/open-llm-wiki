/**
 * storage-notice 单测:键读写 round-trip、过滤纯逻辑。
 * 用内存 Map 模拟 localStorage(纯逻辑,无 jsdom 依赖)。
 */
import { describe, expect, it } from "vitest";
import {
  evictedRatio,
  ignoreConflict,
  isCloudKind,
  isIcloudKind,
  mapStorageError,
  readEvictionDismissedCount,
  readGitAutomation,
  readIgnoredConflicts,
  readStorageNoticeDismissed,
  rootHash,
  visibleConflicts,
  writeEvictionDismissedCount,
  writeGitAutomation,
  writeStorageNoticeDismissed,
} from "./storage-notice";
import type { ConflictPair } from "./ipc";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("storage-notice", () => {
  it("rootHash 稳定且区分不同 root", () => {
    const a = rootHash("/Users/x/icloud-vault");
    expect(rootHash("/Users/x/icloud-vault")).toBe(a);
    expect(rootHash("/Users/x/other")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("存储横幅关闭标记 round-trip(默认未关闭)", () => {
    const s = memStorage();
    expect(readStorageNoticeDismissed(s.getItem, "/v")).toBe(false);
    writeStorageNoticeDismissed(s.setItem, "/v");
    expect(readStorageNoticeDismissed(s.getItem, "/v")).toBe(true);
    // per-root:别的 root 不受影响。
    expect(readStorageNoticeDismissed(s.getItem, "/v2")).toBe(false);
  });

  it("eviction 关闭计数 round-trip(默认 0;损坏值容错回 0)", () => {
    const s = memStorage();
    expect(readEvictionDismissedCount(s.getItem, "/v")).toBe(0);
    writeEvictionDismissedCount(s.setItem, "/v", 3);
    expect(readEvictionDismissedCount(s.getItem, "/v")).toBe(3);
    s.setItem("open-llm-wiki.storageNoticeEvicted." + rootHash("/v"), "NaN");
    expect(readEvictionDismissedCount(s.getItem, "/v")).toBe(0);
    s.setItem("open-llm-wiki.storageNoticeEvicted." + rootHash("/v"), "-5");
    expect(readEvictionDismissedCount(s.getItem, "/v")).toBe(0);
  });

  it("git 自动化覆写三态(null/true/false)round-trip", () => {
    const s = memStorage();
    expect(readGitAutomation(s.getItem, "/v")).toBeNull();
    writeGitAutomation(s.setItem, "/v", true);
    expect(readGitAutomation(s.getItem, "/v")).toBe(true);
    writeGitAutomation(s.setItem, "/v", false);
    expect(readGitAutomation(s.getItem, "/v")).toBe(false);
  });

  it("冲突忽略清单:去重追加 + visibleConflicts 过滤", () => {
    const s = memStorage();
    const pairs: ConflictPair[] = [
      { base: "Note.md", copy: "Note 2.md" },
      { base: "sub/D.md", copy: "sub/D 3.md" },
    ];
    expect(readIgnoredConflicts(s.getItem, "/v")).toEqual([]);
    ignoreConflict(s.getItem, s.setItem, "/v", "Note 2.md");
    ignoreConflict(s.getItem, s.setItem, "/v", "Note 2.md"); // 幂等
    expect(readIgnoredConflicts(s.getItem, "/v")).toEqual(["Note 2.md"]);
    expect(visibleConflicts(pairs, readIgnoredConflicts(s.getItem, "/v"))).toEqual([
      { base: "sub/D.md", copy: "sub/D 3.md" },
    ]);
  });

  it("忽略清单对损坏 JSON 容错", () => {
    const s = memStorage();
    s.setItem("open-llm-wiki.conflictIgnored." + rootHash("/v"), "{not json");
    expect(readIgnoredConflicts(s.getItem, "/v")).toEqual([]);
  });

  it("mapStorageError:OLW_TIMEOUT 前缀映射,其余原样", () => {
    expect(mapStorageError("OLW_TIMEOUT: a.md", "仍在下载…")).toBe("仍在下载…");
    expect(mapStorageError("别的错误", "仍在下载…")).toBe("别的错误");
  });

  it("类别与 eviction 比例判定", () => {
    expect(isCloudKind("local")).toBe(false);
    for (const k of ["icloud", "icloud-managed", "cloud-other"] as const) {
      expect(isCloudKind(k)).toBe(true);
    }
    expect(isIcloudKind("icloud")).toBe(true);
    expect(isIcloudKind("icloud-managed")).toBe(true);
    expect(isIcloudKind("cloud-other")).toBe(false);
    expect(isIcloudKind("local")).toBe(false);
    expect(evictedRatio(null)).toBeNull();
    expect(
      evictedRatio({ kind: "icloud", cloud_docs_root: null, evicted_sampled: 0, evicted_count: 0 }),
    ).toBeNull();
    expect(
      evictedRatio({ kind: "icloud", cloud_docs_root: null, evicted_sampled: 10, evicted_count: 3 }),
    ).toBeCloseTo(0.3);
  });
});
