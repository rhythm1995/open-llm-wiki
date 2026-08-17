/**
 * AgentPanel 组件测试 —— 「提炼进 Wiki」composer seed 流(用户实测反馈回归):
 * ① picker 态点 agent 卡自动发送 seed 后,输入框必须清空(指令不残留);
 * ② 已有会话时 seed 到达即自动发送并清空;
 * ③ agent-done(busy 翻转)重跑 seed effect 时不得把已发送的 seed 回填进输入框;
 * ④ 已消费 seed 卸载再挂载 / 再点 agent 不得再提炼(leftover 横幅 + 误发)。
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
import {
  markAgentSeedConsumed,
  resetAgentSeedConsumedForTests,
} from "../lib/agent-seed";

const invokeMock = vi.hoisted(() => vi.fn());
const listeners = vi.hoisted(
  () => new Map<string, Array<(e: { payload: unknown }) => void>>(),
);
const isMockFn = vi.hoisted(() => vi.fn(() => true));
const readNoteFn = vi.hoisted(
  () => vi.fn(async (_root: string, _path: string) => ""),
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
vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => isMockFn(),
    readNote: (root: string, path: string) => readNoteFn(root, path),
    lintVault: async () => ({ findings: [], duplicate_names: [] }),
  },
}));

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
      case "agent_runtime":
        return Promise.resolve({ alive: false, agentId: null });
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
    isMockFn.mockReturnValue(true);
    readNoteFn.mockReset();
    readNoteFn.mockResolvedValue("");
    setupInvoke();
    window.localStorage.clear();
    resetAgentSeedConsumedForTests();
  });

  it("唯一已装 agent:seed 到达自动启动并发送,输入框清空", async () => {
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 101 }}
      />,
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({
          text: expect.stringContaining("wiki-ingest"),
        }),
      ),
    );
    expect(screen.getAllByText(/wiki-ingest/).length).toBeGreaterThan(0);
    expect(textarea().value).toBe("");
  });

  it("历史回放(不能再选 agent)时 seed 自动拉起上次 agent 并发送", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "agent_list":
          return Promise.resolve([
            AGENT,
            {
              id: "opencode",
              label: "OpenCode",
              command: "opencode",
              installed: true,
              installHint: "",
            },
          ]);
        case "agent_thread_list":
          return Promise.resolve([
            {
              id: 7,
              agent: "claude-code",
              created: 1,
              msg_count: 1,
              last_ts: 1,
            },
          ]);
        case "agent_thread_load":
          return Promise.resolve([{ role: "user", text: "old hi", ts: 1 }]);
        case "agent_thread_create":
          return Promise.resolve(8);
        case "agent_alive":
          return Promise.resolve(true);
        case "agent_runtime":
          return Promise.resolve({ alive: false, agentId: null });
        default:
          return Promise.resolve(null);
      }
    });

    const { rerender } = render(<AgentPanel root="/vault" t={t} />);
    expect(await screen.findByText("old hi")).toBeInTheDocument();
    expect(screen.getByText(/agent\.viewingHistory/)).toBeInTheDocument();

    rerender(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 505 }}
      />,
    );

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_start",
        expect.objectContaining({ agentId: "claude-code" }),
      ),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({ text: SEED }),
      ),
    );
  });

  it("活动会话忙碌时 seed 进队,done 后发出", async () => {
    const { rerender } = render(<AgentPanel root="/vault" t={t} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );
    await waitFor(() => expect(textarea()).toBeInTheDocument());

    rerender(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: "FIRST", token: 601 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("agent_prompt", {
        text: "FIRST",
      }),
    );

    rerender(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: "SECOND", token: 602 }}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const promptsBeforeDone = invokeMock.mock.calls.filter(
      (c) => c[0] === "agent_prompt" && c[1]?.text === "SECOND",
    );
    expect(promptsBeforeDone).toHaveLength(0);

    await act(async () => {
      emit("agent-done", null);
    });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("agent_prompt", {
        text: "SECOND",
      }),
    );
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

  it("活会话重连:不冷启动,seed 只发 prompt", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "agent_list":
          return Promise.resolve([AGENT]);
        case "agent_runtime":
          return Promise.resolve({ alive: true, agentId: "claude-code" });
        case "agent_thread_list":
          return Promise.resolve([
            {
              id: 3,
              agent: "claude-code",
              created: 1,
              msg_count: 1,
              last_ts: 1,
            },
          ]);
        case "agent_thread_load":
          return Promise.resolve([{ role: "user", text: "prior", ts: 1 }]);
        case "agent_alive":
          return Promise.resolve(true);
        default:
          return Promise.resolve(null);
      }
    });
    const { rerender } = render(<AgentPanel root="/vault" t={t} />);
    expect(await screen.findByText("prior")).toBeInTheDocument();
    expect(screen.getByText("agent.active")).toBeInTheDocument();
    expect(invokeMock.mock.calls.some((c) => c[0] === "agent_start")).toBe(
      false,
    );

    rerender(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 707 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({ text: SEED }),
      ),
    );
    expect(invokeMock.mock.calls.some((c) => c[0] === "agent_start")).toBe(
      false,
    );
  });

  it("种子自动发送不附 @ 全文", async () => {
    const getAiContext = vi.fn(async () => "# 当前笔记\nSHOULD_NOT_ATTACH");
    render(
      <AgentPanel
        root="/vault"
        t={t}
        getAiContext={getAiContext}
        composerSeed={{ text: SEED, token: 808 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({ text: SEED }),
      ),
    );
    expect(getAiContext).not.toHaveBeenCalled();
  });

  it("banner: query 用查询文案,不是提炼", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "agent_list":
          return Promise.resolve([
            AGENT,
            {
              id: "opencode",
              label: "OpenCode",
              command: "opencode",
              installed: true,
              installHint: "",
            },
          ]);
        case "agent_runtime":
          return Promise.resolve({ alive: false, agentId: null });
        case "agent_thread_list":
          return Promise.resolve([]);
        default:
          return Promise.resolve(null);
      }
    });
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{
          text: "请把用户的自然语言问题编译成 QQL",
          token: 404,
          banner: "query",
        }}
      />,
    );
    expect(
      await screen.findByText("wiki.query.agentBanner"),
    ).toBeInTheDocument();
    expect(screen.getByText("wiki.query.pickAgent")).toBeInTheDocument();
    expect(screen.queryByText("wiki.digest.agentBanner")).toBeNull();
  });

  it("发送后通知父组件消费 seed", async () => {
    const onSeedConsumed = vi.fn();
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 910 }}
        onSeedConsumed={onSeedConsumed}
      />,
    );
    await waitFor(() => expect(onSeedConsumed).toHaveBeenCalledWith(910));
  });

  it("父组件清空未发送的 seed 后横幅消失", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "agent_list":
          return Promise.resolve([
            AGENT,
            {
              id: "opencode",
              label: "OpenCode",
              command: "opencode",
              installed: true,
              installHint: "",
            },
          ]);
        case "agent_runtime":
          return Promise.resolve({ alive: false, agentId: null });
        case "agent_thread_list":
          return Promise.resolve([]);
        default:
          return Promise.resolve(null);
      }
    });
    const { rerender } = render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 111 }}
      />,
    );
    expect(await screen.findByTestId("agent-seed-banner")).toBeInTheDocument();
    rerender(<AgentPanel root="/vault" t={t} composerSeed={null} />);
    expect(screen.queryByTestId("agent-seed-banner")).toBeNull();
    expect(screen.queryByText("wiki.digest.pickAgent")).toBeNull();
  });

  it("已消费 seed 卸载再挂载不会再发、也不出横幅", async () => {
    const { unmount } = render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 909 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({ text: SEED }),
      ),
    );
    unmount();
    invokeMock.mockClear();
    setupInvoke();
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 909 }}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      invokeMock.mock.calls.some((c) => c[0] === "agent_prompt"),
    ).toBe(false);
    expect(
      invokeMock.mock.calls.some((c) => c[0] === "agent_start"),
    ).toBe(false);
    expect(screen.queryByTestId("agent-seed-banner")).toBeNull();
  });

  it("已消费 leftover seed 不挡住历史回放", async () => {
    markAgentSeedConsumed(912);
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "agent_list":
          return Promise.resolve([AGENT]);
        case "agent_thread_list":
          return Promise.resolve([
            {
              id: 7,
              agent: "claude-code",
              created: 1,
              msg_count: 1,
              last_ts: 1,
            },
          ]);
        case "agent_thread_load":
          return Promise.resolve([{ role: "user", text: "old hi", ts: 1 }]);
        case "agent_runtime":
          return Promise.resolve({ alive: false, agentId: null });
        default:
          return Promise.resolve(null);
      }
    });
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 912 }}
      />,
    );
    expect(await screen.findByText("old hi")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-seed-banner")).toBeNull();
    expect(
      invokeMock.mock.calls.some((c) => c[0] === "agent_start"),
    ).toBe(false);
    expect(
      invokeMock.mock.calls.some((c) => c[0] === "agent_prompt"),
    ).toBe(false);
  });

  it("提炼发过后再点 agent 不会用 leftover seed 再提炼", async () => {
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 911 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({ text: SEED }),
      ),
    );
    fireEvent.click(screen.getByTitle("agent.close"));
    fireEvent.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );
    await waitFor(() =>
      expect(
        invokeMock.mock.calls.filter((c) => c[0] === "agent_start").length,
      ).toBeGreaterThan(1),
    );
    const seedPrompts = invokeMock.mock.calls.filter(
      (c) => c[0] === "agent_prompt" && c[1]?.text === SEED,
    );
    expect(seedPrompts).toHaveLength(1);
  });

  it("提炼 seed 不读、不附 hot.md", async () => {
    isMockFn.mockReturnValue(false);
    readNoteFn.mockResolvedValue("# Hot\nsecret-fact");
    render(
      <AgentPanel
        root="/vault"
        t={t}
        composerSeed={{ text: SEED, token: 1001 }}
      />,
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("agent_prompt", { text: SEED }),
    );
    expect(readNoteFn).not.toHaveBeenCalled();
  });

  it("桌面手动发送:首轮把 hot.md 接到 prompt,气泡仍是原文", async () => {
    isMockFn.mockReturnValue(false);
    readNoteFn.mockResolvedValue("# Hot\nsecret-fact");
    render(<AgentPanel root="/vault" t={t} />);
    fireEvent.click(await screen.findByRole("button", { name: /Claude Code/ }));
    await waitFor(() => expect(textarea()).toBeInTheDocument());
    fireEvent.change(textarea(), { target: { value: "hello-user" } });
    fireEvent.click(screen.getByRole("button", { name: "agent.send" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.objectContaining({
          text: expect.stringMatching(/secret-fact[\s\S]*hello-user/),
        }),
      ),
    );
    expect(readNoteFn).toHaveBeenCalledWith("/vault", "hot.md");
    expect(screen.getByText("hello-user")).toBeInTheDocument();
    expect(screen.queryByText("secret-fact")).toBeNull();
  });

  it("本轮写过 vault 且已读到 hot → done 后提醒覆写", async () => {
    isMockFn.mockReturnValue(false);
    readNoteFn.mockResolvedValue("# Hot\ncache");
    render(<AgentPanel root="/vault" t={t} />);
    fireEvent.click(await screen.findByRole("button", { name: /Claude Code/ }));
    await waitFor(() => expect(textarea()).toBeInTheDocument());
    fireEvent.change(textarea(), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: "agent.send" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "agent_prompt",
        expect.anything(),
      ),
    );
    await act(async () => {
      emit("agent-file-write", { path: "x.md" });
      emit("agent-done", null);
    });
    expect(screen.getByTestId("agent-hot-update")).toHaveTextContent(
      "agent.hotUpdateHint",
    );
  });
});
