import { describe, expect, it } from "vitest";
import {
  canCommitWatchResult,
  isWatchGenCurrent,
  isWatchRootCurrent,
  mergeWatchPaths,
  shouldForceHeal,
  takeWatchBatch,
} from "./vault-watch";

describe("mergeWatchPaths", () => {
  it("并入多批路径,不覆盖旧批(debounce 窗内第二帧)", () => {
    const pending = new Set<string>();
    mergeWatchPaths(pending, ["a.md", "b.md"]);
    mergeWatchPaths(pending, ["b.md", "c.md"]);
    expect([...pending].sort()).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("忽略空串与 null/undefined", () => {
    const pending = new Set<string>(["keep.md"]);
    mergeWatchPaths(pending, null);
    mergeWatchPaths(pending, undefined);
    mergeWatchPaths(pending, ["", "keep.md", "x.md"]);
    expect([...pending].sort()).toEqual(["keep.md", "x.md"]);
  });
});

describe("takeWatchBatch", () => {
  it("返回排序列表并清空 Set", () => {
    const pending = new Set(["z.md", "a.md"]);
    const batch = takeWatchBatch(pending);
    expect(batch).toEqual(["a.md", "z.md"]);
    expect(pending.size).toBe(0);
  });

  it("空 pending → 空批", () => {
    expect(takeWatchBatch(new Set())).toEqual([]);
  });
});

describe("shouldForceHeal", () => {
  it("空批或 apply 失败 → force", () => {
    expect(shouldForceHeal([], false)).toBe(true);
    expect(shouldForceHeal(["a.md"], true)).toBe(true);
    expect(shouldForceHeal(["a.md"], false)).toBe(false);
  });
});

describe("canCommitWatchResult (世代 + root 守卫)", () => {
  it("同 gen 同 root → 可提交", () => {
    expect(canCommitWatchResult(3, 3, "/vaultA", "/vaultA")).toBe(true);
  });

  it("gen 过期(后发先至) → 丢弃", () => {
    // 旧请求 gen=2 完成时 current 已是 5
    expect(canCommitWatchResult(2, 5, "/vaultA", "/vaultA")).toBe(false);
    expect(isWatchGenCurrent(2, 5)).toBe(false);
  });

  it("root 已切走 → 丢弃(防 vault A 结果写进 vault B)", () => {
    expect(canCommitWatchResult(1, 1, "/vaultA", "/vaultB")).toBe(false);
    expect(isWatchRootCurrent("/vaultA", "/vaultB")).toBe(false);
    expect(isWatchRootCurrent("/vaultA", null)).toBe(false);
  });

  it("gen 与 root 均匹配才可写", () => {
    expect(canCommitWatchResult(1, 2, "/a", "/a")).toBe(false);
    expect(canCommitWatchResult(2, 2, "/a", "/b")).toBe(false);
    expect(canCommitWatchResult(2, 2, "/a", "/a")).toBe(true);
  });
});
