/**
 * ArchiveView —— mock 提示;非仓库可 init;已删笔记还原。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunc } from "../lib/i18n";
import type { VaultActions } from "../lib/store";

const mockMode = { current: true };
const gitIsRepo = vi.fn(async (..._args: unknown[]) => false);
const gitInit = vi.fn(async (..._args: unknown[]) => {});
const gitDeletedNotes = vi.fn(async (..._args: unknown[]) => [
  {
    path: "gone.md",
    title: "gone",
    commit: "deadbeef",
    deleted_at: "2026-08-01",
  },
]);
const gitLogRaw = vi.fn(
  async (..._args: unknown[]) => "cafebabe\tAda\t2026-08-01\tdelete gone\n",
);

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => mockMode.current,
    gitIsRepo: (...a: unknown[]) => gitIsRepo(...(a as [string])),
    gitInit: (...a: unknown[]) => gitInit(...(a as [string])),
    gitDeletedNotes: (...a: unknown[]) => gitDeletedNotes(...(a as [string])),
    gitLogRaw: (...a: unknown[]) => gitLogRaw(...(a as [string, number?])),
  },
}));

import { ArchiveView } from "./ArchiveView";

const t = ((key: string) => key) as TFunc;

describe("ArchiveView", () => {
  const restoreNote = vi.fn(async () => {});
  const actions = { restoreNote } as unknown as VaultActions;

  beforeEach(() => {
    mockMode.current = true;
    restoreNote.mockClear();
    gitIsRepo.mockReset();
    gitInit.mockReset();
    gitDeletedNotes.mockClear();
    gitLogRaw.mockClear();
    gitIsRepo.mockResolvedValue(false);
  });

  it("无 root 显示空态", () => {
    render(<ArchiveView root={null} actions={actions} t={t} />);
    expect(screen.getByText("git.empty")).toBeInTheDocument();
  });

  it("mock 模式只提示,不打 git", () => {
    render(<ArchiveView root="/v" actions={actions} t={t} />);
    expect(screen.getByTestId("archive-mock-hint")).toBeInTheDocument();
    expect(gitIsRepo).not.toHaveBeenCalled();
  });

  it("非 git 仓库显示初始化,点了走 gitInit", async () => {
    mockMode.current = false;
    gitIsRepo.mockResolvedValueOnce(false).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ArchiveView root="/v" actions={actions} t={t} />);
    expect(await screen.findByTestId("archive-init")).toBeInTheDocument();
    await user.click(screen.getByTestId("archive-init"));
    await waitFor(() => expect(gitInit).toHaveBeenCalledWith("/v"));
  });

  it("仓库列出已删笔记,点行还原并刷新", async () => {
    mockMode.current = false;
    gitIsRepo.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ArchiveView root="/v" actions={actions} t={t} />);
    const row = await screen.findByTestId("archive-restore-gone.md");
    expect(row).toHaveTextContent("gone");
    expect(screen.getByText("delete gone")).toBeInTheDocument();
    await user.click(row);
    await waitFor(() => expect(restoreNote).toHaveBeenCalledWith("gone.md"));
  });

  it("init 失败展示错误", async () => {
    mockMode.current = false;
    gitIsRepo.mockResolvedValue(false);
    gitInit.mockRejectedValue(new Error("cannot init"));
    const user = userEvent.setup();
    render(<ArchiveView root="/v" actions={actions} t={t} />);
    await user.click(await screen.findByTestId("archive-init"));
    expect(await screen.findByText("archive.initFailed")).toBeInTheDocument();
  });
});
