/**
 * AgentPanel 组件测试 —— 「提炼进 Wiki」composer seed 流(用户实测反馈回归):
 * ① picker 态点 agent 卡自动发送 seed 后,输入框必须清空(指令不残留);
 * ② 已有会话时 seed 到达即自动发送并清空;
 * ③ agent-done(busy 翻转)重跑 seed effect 时不得把已发送的 seed 回填进输入框。
 *
 * mock 边界:@tauri-apps/api 的 invoke / listen(面板直接 import);ipc 走 mock 模式,
 * 避免「记忆接入」横幅等桌面专属逻辑进 DOM。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { AgentPanel } from "./AgentPanel";
import type { TFunc } from "../lib/i18n";

const invokeMock = vi.hoisted(() => vi.fn());
const listeners = vi.hoisted(
  () => new Map<string, Array<(e: { payload: unknown }) => void>>(),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    name: string,
    fn: (e: { payload: unknown }) => void,
  ): Promise<() => void> => {
    const arr = listeners.get(name) ?? [];
    arr.push(fn);
    listeners.set(name, arr);
    return () => {};
  },
}));
vi.mock("../lib/ipc", () => ({ ipc: { isMock: () => true } }));

const t = ((key: string) => key) as TFunc;

const AGENT = {
  id: "claude-code",
  label: "Claude Code",
  command: "claude",
  installed: true,
  installHint: "",
};

const SEED = "请执行 vault skill **wiki-ingest**,对本笔记做 ingest / 提炼。";

function setupInvoke() {
  invokeMock.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "agent_list":
        return Promise.resolve([AGENT]);
      case "agent_thread_create":
        return Promise.resolve(1);
      case "agent_alive":
        return Promise.resolve(true);
      case "agent_thread_list":
        return Promise.resolve([]);
      default:
        // agent_start / agent_prompt / agent_thread_append … 全部静默成功。
        return Promise.resolve(null);
    }
  });
}

function emit(name: string, payload: unknown) {
  for (const fn of listeners.get(name) ?? []) fn({ payload });
}

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText("agent.placeholder") as HTMLTextAreaElement;
}

describe("AgentPanel composerSeed(提炼进 Wiki)", () => {
  beforeEach(() => {
    listeners.clear();
    invokeMock.mockReset();
    setupInvoke();
    window.localStorage.clear();
  });

  it("picker 态点 agent 卡:自动发送 seed 后输入框清空", async () => {
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 101 }}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({
          text: expect.stringContaining("wiki-ingest"),
        }),
      ),
    );
    // 用户气泡已展示 seed,输入框不留已执行的指令。
    expect(screen.getAllByText(/wiki-ingest/).length).toBeGreaterThan(0);
    expect(textarea().value).toBe("");
  });

  it("已有会话:seed 到达即自动发送并清空", async () => {
    const { rerender } = render(<AgentPanel root="/vault" t={t} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );
    await waitFor(() => expect(textarea()).toBeInTheDocument());

    rerender(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 202 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("agent_prompt", {
        text: SEED,
      }),
    );
    expect(textarea().value).toBe("");
  });

  it("agent-done 后(busy 翻转)不把已发送的 seed 回填进输入框", async () => {
    const { rerender } = render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 303 }}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.anything(),
      ),
    );
    expect(textarea().value).toBe("");

    // agent 完成 → busy 翻转 + 父组件常态重跑 effect(依赖数组含 active/busy)。
    await act(async () => {
      emit("agent-done", null);
    });
    rerender(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 303 }}
      />,
    );
    await act(async () => {
      emit("agent-done", null);
    });
    expect(textarea().value).toBe("");
  });
});
