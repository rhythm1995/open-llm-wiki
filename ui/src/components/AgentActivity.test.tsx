/**
 * AgentActivity —— 列出 post-turn;diff / 采纳 / 撤销;空列表不渲染。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunc } from "../lib/i18n";

const invoke = vi.fn(async (..._args: unknown[]) => [] as unknown);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { AgentActivity } from "./AgentActivity";

const t = ((key: string) => key) as TFunc;

const post = {
  oid: "abc123",
  phase: "post",
  date: "12:00",
  subject: "turn",
  stat: "+2 −0",
  files: ["a.md", "b.md"],
  adopted: false,
};

describe("AgentActivity", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "agent_activity") return [];
      if (cmd === "agent_diff") return "diff body";
      return undefined;
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("alert", vi.fn());
  });

  it("无 post 条目时不渲染", async () => {
    invoke.mockResolvedValue([
      { ...post, phase: "pre", oid: "pre1" },
    ]);
    const { container } = render(
      <AgentActivity root="/v" agentId="opencode" refreshKey={0} t={t} />,
    );
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("列出 post 条目,点 diff 拉正文", async () => {
    invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "agent_activity") return [post];
      if (cmd === "agent_diff") return "+ hello";
      return undefined;
    });
    const user = userEvent.setup();
    render(<AgentActivity root="/v" agentId="opencode" refreshKey={1} t={t} />);
    expect(await screen.findByTestId("agent-activity")).toBeInTheDocument();
    await user.click(screen.getByTestId("agent-activity-toggle"));
    expect(screen.getByText("+2 −0")).toBeInTheDocument();
    expect(screen.getByText("a.md, b.md")).toBeInTheDocument();
    await user.click(screen.getByTestId("agent-activity-diff-abc123"));
    expect(invoke).toHaveBeenCalledWith("agent_diff", {
      root: "/v",
      oid: "abc123",
    });
    expect(await screen.findByTestId("agent-activity-diff-body")).toHaveTextContent(
      "+ hello",
    );
  });

  it("采纳需确认后调 agent_adopt", async () => {
    invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "agent_activity") return [post];
      return undefined;
    });
    const user = userEvent.setup();
    render(<AgentActivity root="/v" agentId="opencode" refreshKey={2} t={t} />);
    await user.click(await screen.findByTestId("agent-activity-toggle"));
    await user.click(screen.getByTestId("agent-activity-adopt-abc123"));
    expect(window.confirm).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("agent_adopt", {
      root: "/v",
      oid: "abc123",
    });
  });

  it("取消确认则不 revert", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    invoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "agent_activity") return [post];
      return undefined;
    });
    const user = userEvent.setup();
    render(<AgentActivity root="/v" agentId="opencode" refreshKey={3} t={t} />);
    await user.click(await screen.findByTestId("agent-activity-toggle"));
    await user.click(screen.getByTestId("agent-activity-revert-abc123"));
    expect(invoke).not.toHaveBeenCalledWith(
      "agent_revert",
      expect.anything(),
    );
  });
});
