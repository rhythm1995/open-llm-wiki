import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_DOCS_URL,
  PROJECT_ISSUES_URL,
  PROJECT_REPO_URL,
  openProjectIssues,
  openUserDocs,
  resetExternalOpenGate,
  setExternalOpenerForTests,
  shouldOpenExternal,
} from "./project";

describe("project urls", () => {
  it("issues 落在公开仓库下", () => {
    expect(PROJECT_REPO_URL).toBe("https://github.com/rhythm1995/open-llm-wiki");
    expect(PROJECT_ISSUES_URL).toBe(
      "https://github.com/rhythm1995/open-llm-wiki/issues",
    );
  });

  it("用户文档指向 Pages /docs/start", () => {
    expect(PROJECT_DOCS_URL).toBe(
      "https://rhythm1995.github.io/open-llm-wiki/docs/start",
    );
  });
});

describe("shouldOpenExternal", () => {
  it("首次打开放行", () => {
    expect(shouldOpenExternal(null, PROJECT_ISSUES_URL, 1_000)).toBe(true);
  });

  it("同一 URL 在窗口内去重", () => {
    const prev = { url: PROJECT_ISSUES_URL, at: 1_000 };
    expect(shouldOpenExternal(prev, PROJECT_ISSUES_URL, 1_400)).toBe(false);
    expect(shouldOpenExternal(prev, PROJECT_ISSUES_URL, 1_801)).toBe(true);
  });

  it("不同 URL 不互相挡住", () => {
    const prev = { url: PROJECT_ISSUES_URL, at: 1_000 };
    expect(shouldOpenExternal(prev, PROJECT_DOCS_URL, 1_010)).toBe(true);
  });
});

describe("openProjectIssues / openUserDocs", () => {
  afterEach(() => {
    resetExternalOpenGate();
    setExternalOpenerForTests(null);
  });

  it("连点同一入口只打开一次", () => {
    const openExternalUrl = vi.fn();
    setExternalOpenerForTests(openExternalUrl);
    openProjectIssues();
    openProjectIssues();
    openProjectIssues();
    expect(openExternalUrl).toHaveBeenCalledTimes(1);
    expect(openExternalUrl).toHaveBeenCalledWith(PROJECT_ISSUES_URL);
  });

  it("文档入口打开 Pages start", () => {
    const openExternalUrl = vi.fn();
    setExternalOpenerForTests(openExternalUrl);
    openUserDocs();
    expect(openExternalUrl).toHaveBeenCalledWith(PROJECT_DOCS_URL);
  });
});
