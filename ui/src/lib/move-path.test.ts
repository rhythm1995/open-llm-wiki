import { describe, expect, it } from "vitest";
import { pathBase, pathDir, resolveMoveTarget } from "./move-path";

describe("pathDir / pathBase", () => {
  it("根文件", () => {
    expect(pathDir("a.md")).toBe("");
    expect(pathBase("a.md")).toBe("a.md");
  });
  it("嵌套", () => {
    expect(pathDir("notes/inbox/a.md")).toBe("notes/inbox");
    expect(pathBase("notes/inbox/a.md")).toBe("a.md");
  });
});

describe("resolveMoveTarget", () => {
  it("移到子目录", () => {
    expect(resolveMoveTarget("a.md", "notes")).toBe("notes/a.md");
  });
  it("移到根", () => {
    expect(resolveMoveTarget("notes/a.md", "")).toBe("a.md");
  });
  it("同目录 → null", () => {
    expect(resolveMoveTarget("notes/a.md", "notes")).toBeNull();
  });
  it("空 from → null", () => {
    expect(resolveMoveTarget("", "notes")).toBeNull();
  });
  it("不能拖进自身路径", () => {
    expect(resolveMoveTarget("notes", "notes")).toBeNull();
  });
  it("跨目录改名路径", () => {
    expect(resolveMoveTarget("a/b.md", "x/y")).toBe("x/y/b.md");
  });
});
