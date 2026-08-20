/**
 * GitPanel —— mock 横幅禁用远端;桌面刷 status/log、提交、冲突。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunc } from "../lib/i18n";

const mockMode = { current: true };
const gitStatusRaw = vi.fn(async (..._args: unknown[]) => " M dirty.md\n");
const gitLogRaw = vi.fn(
  async (..._args: unknown[]) => "abc1234\tAda\t2026-08-01\tinit\n",
);
const gitCommit = vi.fn(async (..._args: unknown[]) => "ok");
const gitPull = vi.fn(async (..._args: unknown[]) => "Already up to date.");
const gitPush = vi.fn(async (..._args: unknown[]) => "pushed");

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => mockMode.current,
    gitStatusRaw: (...a: unknown[]) => gitStatusRaw(...(a as [string])),
    gitLogRaw: (...a: unknown[]) => gitLogRaw(...(a as [string])),
    gitCommit: (...a: unknown[]) => gitCommit(...(a as [string, string])),
    gitPull: (...a: unknown[]) => gitPull(...(a as [string])),
    gitPush: (...a: unknown[]) => gitPush(...(a as [string])),
  },
}));

import { GitPanel } from "./GitPanel";

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key;
  return `${key} ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")}`;
}) as TFunc;

describe("GitPanel", () => {
  beforeEach(() => {
    mockMode.current = true;
    gitStatusRaw.mockClear();
    gitLogRaw.mockClear();
    gitCommit.mockClear();
    gitPull.mockClear();
    gitPush.mockClear();
    gitStatusRaw.mockResolvedValue(" M dirty.md\n");
    gitLogRaw.mockResolvedValue("abc1234\tAda\t2026-08-01\tinit\n");
  });

  it("无 root 显示空态", () => {
    render(<GitPanel root={null} t={t} />);
    expect(screen.getByText("git.empty")).toBeInTheDocument();
  });

  it("mock 模式提示且 pull/push 禁用", async () => {
    render(<GitPanel root="/v" t={t} />);
    expect(await screen.findByTestId("git-mock-hint")).toBeInTheDocument();
    expect(screen.getByTestId("git-pull")).toBeDisabled();
    expect(screen.getByTestId("git-push")).toBeDisabled();
  });

  it("桌面列出变更与最近提交,有消息才能 commit", async () => {
    mockMode.current = false;
    const user = userEvent.setup();
    render(<GitPanel root="/v" t={t} />);
    expect(await screen.findByText("dirty.md")).toBeInTheDocument();
    expect(screen.getByText("init")).toBeInTheDocument();
    expect(screen.getByTestId("git-commit")).toBeDisabled();
    await user.type(screen.getByTestId("git-commit-message"), "fix: n");
    await user.click(screen.getByTestId("git-commit"));
    await waitFor(() =>
      expect(gitCommit).toHaveBeenCalledWith("/v", "fix: n"),
    );
  });

  it("pull / push 调 IPC 并刷状态", async () => {
    mockMode.current = false;
    const user = userEvent.setup();
    render(<GitPanel root="/v" t={t} />);
    await screen.findByText("dirty.md");
    gitStatusRaw.mockClear();
    await user.click(screen.getByTestId("git-pull"));
    await waitFor(() => expect(gitPull).toHaveBeenCalledWith("/v"));
    await user.click(screen.getByTestId("git-push"));
    await waitFor(() => expect(gitPush).toHaveBeenCalledWith("/v"));
  });

  it("冲突行出现横幅并禁用 push", async () => {
    mockMode.current = false;
    gitStatusRaw.mockResolvedValue("UU conflict.md\n");
    render(<GitPanel root="/v" t={t} />);
    expect(await screen.findByTestId("git-conflicts")).toHaveTextContent(
      "conflict.md",
    );
    expect(screen.getByTestId("git-push")).toBeDisabled();
  });

  it("refresh 失败显示 error", async () => {
    mockMode.current = false;
    gitStatusRaw.mockRejectedValue(new Error("not a git repo"));
    render(<GitPanel root="/v" t={t} />);
    expect(await screen.findByTestId("git-error")).toHaveTextContent(
      "not a git repo",
    );
  });
});
