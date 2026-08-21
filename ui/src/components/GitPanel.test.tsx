/**
 * GitPanel —— mock 横幅禁用远端;桌面刷 status/log、提交、冲突;
 * 非 git 仓库空态一键 init;零提交仓库显示首提引导而非错误。
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
const gitIsRepo = vi.fn(async (..._args: unknown[]) => true);
const gitInit = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => mockMode.current,
    gitStatusRaw: (...a: unknown[]) => gitStatusRaw(...(a as [string])),
    gitLogRaw: (...a: unknown[]) => gitLogRaw(...(a as [string])),
    gitCommit: (...a: unknown[]) => gitCommit(...(a as [string, string])),
    gitPull: (...a: unknown[]) => gitPull(...(a as [string])),
    gitPush: (...a: unknown[]) => gitPush(...(a as [string])),
    gitIsRepo: (...a: unknown[]) => gitIsRepo(...(a as [string])),
    gitInit: (...a: unknown[]) => gitInit(...(a as [string])),
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
    gitIsRepo.mockClear();
    gitInit.mockClear();
    gitStatusRaw.mockResolvedValue(" M dirty.md\n");
    gitLogRaw.mockResolvedValue("abc1234\tAda\t2026-08-01\tinit\n");
    gitIsRepo.mockResolvedValue(true);
    gitInit.mockResolvedValue(undefined);
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

  it("非 git 仓库:空态一键 init 后进入面板", async () => {
    mockMode.current = false;
    // 首次探测非仓库;init 后复测为仓库。
    gitIsRepo.mockResolvedValueOnce(false).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<GitPanel root="/v" t={t} />);
    expect(await screen.findByTestId("git-not-repo")).toHaveTextContent(
      "git.notRepo",
    );
    // 无仓库时不渲染提交表单,pull/push 也禁用。
    expect(screen.queryByTestId("git-commit")).not.toBeInTheDocument();
    expect(screen.getByTestId("git-pull")).toBeDisabled();
    expect(screen.getByTestId("git-push")).toBeDisabled();
    await user.click(screen.getByTestId("git-init"));
    await waitFor(() => expect(gitInit).toHaveBeenCalledWith("/v"));
    // init 后刷新,回到正常面板(status 可见)。
    expect(await screen.findByText("dirty.md")).toBeInTheDocument();
  });

  it("零提交仓库:status 照常、log 空显示首提引导且无红错", async () => {
    mockMode.current = false;
    gitStatusRaw.mockResolvedValue("?? new.md\n");
    gitLogRaw.mockResolvedValue("");
    render(<GitPanel root="/v" t={t} />);
    expect(await screen.findByText("new.md")).toBeInTheDocument();
    expect(screen.getByText("git.noHistory")).toBeInTheDocument();
    expect(screen.getByText("git.noCommitsHint")).toBeInTheDocument();
    expect(screen.queryByTestId("git-error")).not.toBeInTheDocument();
  });

  // ── doc 17 G3:iCloud 防护区 ──

  it("icloud vault:显示防护区,「仍要启用」回调触发", async () => {
    mockMode.current = false;
    const onEnable = vi.fn();
    render(
      <GitPanel
        root="/v"
        t={t}
        storageKind="icloud"
        gitAutomationEnabled={false}
        onEnableGitAutomation={onEnable}
      />,
    );
    expect(await screen.findByTestId("git-icloud-guard")).toHaveTextContent(
      "git.icloudGuard.title",
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("git-icloud-enable"));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it("icloud vault 已显式启用:防护区换为已启用提示", async () => {
    mockMode.current = false;
    render(
      <GitPanel
        root="/v"
        t={t}
        storageKind="icloud"
        gitAutomationEnabled={true}
        onEnableGitAutomation={vi.fn()}
      />,
    );
    expect(
      await screen.findByTestId("git-icloud-enabled-hint"),
    ).toHaveTextContent("git.icloudGuard.enabledHint");
    expect(screen.queryByTestId("git-icloud-guard")).not.toBeInTheDocument();
  });

  it("已启用后可再停用(双向开关)", async () => {
    mockMode.current = false;
    const onDisable = vi.fn();
    render(
      <GitPanel
        root="/v"
        t={t}
        storageKind="icloud"
        gitAutomationEnabled={true}
        onEnableGitAutomation={vi.fn()}
        onDisableGitAutomation={onDisable}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("git-icloud-disable"));
    expect(onDisable).toHaveBeenCalledOnce();
  });

  it("local / icloud-managed / 未传 storageKind:不出防护区(IC-1 宽松)", async () => {
    mockMode.current = false;
    for (const kind of [null, "local", "icloud-managed", "cloud-other"]) {
      const { unmount } = render(
        <GitPanel root="/v" t={t} storageKind={kind} gitAutomationEnabled={false} />,
      );
      expect(screen.queryByTestId("git-icloud-guard")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("git-icloud-enabled-hint"),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
