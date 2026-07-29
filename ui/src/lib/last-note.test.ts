import { describe, it, expect } from "vitest";
import { lastPathKey, pickRestorableNote } from "./last-note";

describe("lastPathKey", () => {
  it("按 root 分键", () => {
    expect(lastPathKey("/a/b")).toBe("openobs.lastPath:/a/b");
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
