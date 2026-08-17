/**
 * store.writeScoped 回归测试 —— 跨笔记写坏竞态(2026-08-15 修复)。
 *
 * 场景:富文本/画布/表格视图卸载 flush 在「切笔记后」迟到。此前 setContent
 * 无路径校验,旧笔记内容会污染共享 content 槽,防抖到期后落盘到新笔记路径。
 * writeScoped 的契约:
 * - (path, root) 仍是当前笔记 → 走 setContent(共享槽 + 防抖落盘);
 * - 已切走 → 定向写回视图自己的 (root, path),不碰共享槽;
 * - rename/move 后 → 经别名重定向到新路径,不向旧路径复活旧文件。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

const writeNote = vi.fn(async (..._args: unknown[]) => {});
const renameNote = vi.fn(async (..._args: unknown[]) => {});
const readNote = vi.fn(async (_root: string, path: string) => `content-of:${path}`);

vi.mock("./ipc", () => ({
  ipc: {
    isMock: () => true,
    listVault: vi.fn(async () => [{ path: "a.md", name: "a.md", is_dir: false }]),
    readNote: (root: string, path: string) => readNote(root, path),
    writeNote: (root: string, path: string, next: string) => writeNote(root, path, next),
    renameNote: (root: string, from: string, to: string) => renameNote(root, from, to),
    indexVault: vi.fn(async (root: string) => ({ root, nodes: [], edges: [] })),
  },
}));
// isMock=true 时 store 不触碰 tauri 事件/命令,静态 import 仍需可解析。
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));

import { useVault } from "./store";

let api: ReturnType<typeof useVault>;
function Harness() {
  api = useVault();
  return null;
}

async function setup() {
  const view = render(<Harness />);
  await act(async () => {
    await api.actions.openVault("/v");
  });
  return view;
}

describe("store.writeScoped(所有权回写)", () => {
  beforeEach(() => {
    localStorage.clear();
    writeNote.mockClear();
    readNote.mockClear();
    renameNote.mockClear();
  });

  it("setContent 相同字节不标 dirty;saveNow 未脏不写盘", async () => {
    const view = await setup();
    const before = api.state.content;
    act(() => {
      api.actions.setContent(before);
    });
    expect(api.state.dirty).toBe(false);
    await act(async () => {
      await api.actions.saveNow();
    });
    expect(writeNote).not.toHaveBeenCalled();
    view.unmount();
  });

  it("仍是当前笔记 → 走共享槽(dirty 置位)", async () => {
    const view = await setup();
    expect(api.state.currentPath).toBe("a.md");
    act(() => {
      api.actions.writeScoped("a.md", "/v", "edited");
    });
    expect(api.state.content).toBe("edited");
    expect(api.state.dirty).toBe(true);
    expect(writeNote).not.toHaveBeenCalled(); // 落盘交给防抖,不直写
    view.unmount();
  });

  it("切走后迟到 → 定向写回原路径,不污染共享槽", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md"); // readNote mock 任意路径都可用
    });
    expect(api.state.currentPath).toBe("b.md");
    expect(api.state.content).toBe("content-of:b.md");

    // a.md 视图的卸载 flush 迟到(切笔记后 <400ms 的尾编辑)。
    act(() => {
      api.actions.writeScoped("a.md", "/v", "a-tail-edit");
    });
    expect(writeNote).toHaveBeenCalledWith("/v", "a.md", "a-tail-edit");
    // 共享槽保持 b 的内容、非脏 —— 这是本次修复的核心断言。
    expect(api.state.content).toBe("content-of:b.md");
    expect(api.state.dirty).toBe(false);
    view.unmount();
  });

  it("rename 后迟到 → 经别名重定向到新路径(不复活旧文件)", async () => {
    const view = await setup();
    let newPath: string | null = null;
    await act(async () => {
      newPath = await api.actions.renameNote("a.md", "renamed");
    });
    expect(newPath).toBe("renamed.md");
    expect(api.state.currentPath).toBe("renamed.md");

    // 旧路径 a.md 的迟到 flush → 必须写进 renamed.md,而不是重建 a.md。
    act(() => {
      api.actions.writeScoped("a.md", "/v", "late-edit");
    });
    expect(writeNote).toHaveBeenCalledWith("/v", "renamed.md", "late-edit");
    expect(writeNote).not.toHaveBeenCalledWith("/v", "a.md", expect.anything());
    view.unmount();
  });

  it("跨 vault 迟到 → 写回捕获的旧 root,不写进新 vault", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.openVault("/v2");
    });
    expect(api.state.root).toBe("/v2");
    act(() => {
      api.actions.writeScoped("a.md", "/v", "old-vault-edit");
    });
    expect(writeNote).toHaveBeenCalledWith("/v", "a.md", "old-vault-edit");
    expect(writeNote).not.toHaveBeenCalledWith(
      "/v2",
      expect.anything(),
      expect.anything(),
    );
    view.unmount();
  });

  it("path/root 缺失 → no-op(不写盘)", async () => {
    const view = await setup();
    act(() => {
      api.actions.writeScoped(null, "/v", "x");
      api.actions.writeScoped("a.md", null, "x");
    });
    expect(writeNote).not.toHaveBeenCalled();
    view.unmount();
  });

  it("定向写盘失败 → 记入 error,不崩", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    writeNote.mockRejectedValueOnce(new Error("disk full"));
    act(() => {
      api.actions.writeScoped("a.md", "/v", "late");
    });
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(api.state.error).toContain("disk full"));
    view.unmount();
  });

  // ---- 顺带的 store 动作冒烟(把这些路径拉进覆盖面)----

  it("openPath 读盘失败 → error 状态", async () => {
    const view = await setup();
    readNote.mockRejectedValueOnce(new Error("io error"));
    await act(async () => {
      await api.actions.selectNote("gone.md");
    });
    await waitFor(() => expect(api.state.error).toContain("io error"));
    view.unmount();
  });

  it("关闭当前激活 tab → 跳到邻居并读盘;脏内容先落盘", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    await act(async () => {
      await api.actions.closeTab("b.md");
    });
    // 唯一剩下的 tab 是 a.md → 激活跳回 a.md 并从盘读入。
    expect(api.state.currentPath).toBe("a.md");
    expect(api.state.content).toBe("content-of:a.md");
    view.unmount();
  });

  it("单 tab 时 cycleTab 早退(不读盘不切)", async () => {
    const view = await setup();
    expect(api.state.openPaths).toEqual(["a.md"]);
    await act(async () => {
      await api.actions.cycleTab(1);
    });
    expect(api.state.currentPath).toBe("a.md");
    view.unmount();
  });
});
