import { describe, it, expect, beforeEach } from "vitest";
import {
  lastPathKey,
  pickRestorableNote,
  mergeRecentRoot,
  removeRecentRootFromList,
  readRecentRoots,
  writeRecentRoots,
  pushRecentRoot,
  forgetRecentRoot,
  readLastRoot,
  writeLastRoot,
  RECENT_ROOTS_MAX,
} from "./last-note";

describe("lastPathKey", () => {
  it("按 root 分键", () => {
    expect(lastPathKey("/a/b")).toBe("open-llm-wiki.lastPath:/a/b");
    expect(lastPathKey("/a/b")).not.toBe(lastPathKey("/a/c"));
  });
});

describe("pickRestorableNote", () => {
  const known = ["foo.md", "dir/bar.md", "z.md"];

  it("lastPath 为 null → null", () => {
    expect(pickRestorableNote(null, known)).toBeNull();
  });

  it("lastPath 为空串 → null", () => {
    expect(pickRestorableNote("", known)).toBeNull();
  });

  it("lastPath 仍在 vault 中 → 返回它", () => {
    expect(pickRestorableNote("dir/bar.md", known)).toBe("dir/bar.md");
  });

  it("lastPath 已不存在(被删/改名)→ null,避免恢复悬空路径", () => {
    expect(pickRestorableNote("gone.md", known)).toBeNull();
  });

  it("候选为空 → null", () => {
    expect(pickRestorableNote("foo.md", [])).toBeNull();
  });
});

describe("mergeRecentRoot", () => {
  it("推到头部并去重", () => {
    expect(mergeRecentRoot(["/a", "/b"], "/b")).toEqual(["/b", "/a"]);
  });

  it("截断到 max", () => {
    const roots = ["/1", "/2", "/3", "/4", "/5"];
    expect(mergeRecentRoot(roots, "/x", 3)).toEqual(["/x", "/1", "/2"]);
  });

  it("空串不改变列表", () => {
    expect(mergeRecentRoot(["/a"], "  ")).toEqual(["/a"]);
  });
});

describe("removeRecentRootFromList", () => {
  it("移除匹配项", () => {
    expect(removeRecentRootFromList(["/a", "/b"], "/a")).toEqual(["/b"]);
  });
});

describe("recent roots localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writeLastRoot 同步推入最近列表", () => {
    writeLastRoot("/vault-a");
    writeLastRoot("/vault-b");
    expect(readLastRoot()).toBe("/vault-b");
    expect(readRecentRoots()[0]).toBe("/vault-b");
    expect(readRecentRoots()).toContain("/vault-a");
  });

  it("forgetRecentRoot 清 last 与列表项", () => {
    writeLastRoot("/gone");
    pushRecentRoot("/keep");
    forgetRecentRoot("/gone");
    expect(readLastRoot()).toBeNull();
    expect(readRecentRoots()).toEqual(["/keep"]);
  });

  it("writeRecentRoots 尊重上限", () => {
    const many = Array.from({ length: 10 }, (_, i) => `/v${i}`);
    writeRecentRoots(many);
    expect(readRecentRoots()).toHaveLength(RECENT_ROOTS_MAX);
  });
});
