/**
 * store vault 生命周期 —— 打开 / 恢复 / CRUD / tab / 防抖保存 / 切库。
 *
 * 每条只锁一件用户契约。IPC 换成内存 Map(mock-tauri);不测桌面 watcher
 * (那是 vault-watch.ts + isMock 旁路)。writeScoped 竞态见 store-flush.test.tsx。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

type Entry = { path: string; name: string; is_dir: boolean };

const files = new Map<string, string>();
const dirs = new Set<string>();

function listEntries(): Entry[] {
  const out: Entry[] = [];
  for (const d of dirs) {
    out.push({ path: d, name: d.split("/").pop() ?? d, is_dir: true });
  }
  for (const p of files.keys()) {
    out.push({ path: p, name: p.split("/").pop() ?? p, is_dir: false });
  }
  return out;
}

function snapshot(root: string) {
  const nodes = [];
  const edges: {
    from: number;
    to: number | null;
    unresolved: string | null;
    kind: "wiki" | "relation";
    relation: string | null;
    anchor: string | null;
  }[] = [];
  const byPath = new Map<string, number>();
  let id = 1;
  for (const [path, content] of files) {
    if (!path.endsWith(".md")) continue;
    const title =
      content.match(/^#\s+(.+)$/m)?.[1] ??
      path.replace(/\.md$/i, "").split("/").pop() ??
      path;
    byPath.set(path.replace(/\.md$/i, ""), id);
    byPath.set(path, id);
    byPath.set(title, id);
    nodes.push({
      id,
      path,
      title,
      type: null,
      tags: [] as string[],
      status: null,
      created: null,
      modified: id,
      preview: content.slice(0, 80),
    });
    id += 1;
  }
  for (const n of nodes) {
    const body = files.get(n.path) ?? "";
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const target = m[1].split("|")[0].trim();
      const to = byPath.get(target) ?? byPath.get(`${target}.md`) ?? null;
      edges.push({
        from: n.id,
        to,
        unresolved: to == null ? target : null,
        kind: "wiki",
        relation: null,
        anchor: null,
      });
    }
  }
  return { root, nodes, edges };
}

const writeNote = vi.fn(async (_root: string, path: string, next: string) => {
  files.set(path, next);
});
const createNoteIpc = vi.fn(
  async (_root: string, path: string, body: string) => {
    files.set(path, body);
  },
);
const deleteNoteIpc = vi.fn(async (_root: string, path: string) => {
  files.delete(path);
});
const renameNoteIpc = vi.fn(
  async (_root: string, from: string, to: string) => {
    const body = files.get(from);
    if (body == null) throw new Error("missing");
    files.delete(from);
    files.set(to, body);
  },
);
const restoreNoteIpc = vi.fn(async (_root: string, path: string) => {
  if (!files.has(path)) files.set(path, `# restored ${path}\n`);
});
const pickVault = vi.fn(async () => "/picked" as string | null);
const indexFail = { current: false };
const writeFail = { current: false };

vi.mock("./ipc", () => ({
  ipc: {
    isMock: () => true,
    listVault: async () => listEntries(),
    readNote: async (_root: string, path: string) => {
      const body = files.get(path);
      if (body == null) throw new Error(`no such note: ${path}`);
      return body;
    },
    writeNote: async (root: string, path: string, next: string) => {
      if (writeFail.current) throw new Error("write denied");
      return writeNote(root, path, next);
    },
    createNote: (root: string, path: string, body: string) =>
      createNoteIpc(root, path, body),
    deleteNote: (root: string, path: string) => deleteNoteIpc(root, path),
    renameNote: (root: string, from: string, to: string) =>
      renameNoteIpc(root, from, to),
    gitRestoreNote: (root: string, path: string) => restoreNoteIpc(root, path),
    indexVault: async (root: string) => {
      if (indexFail.current) throw new Error("index boom");
      return snapshot(root);
    },
    applyVaultChanges: async (root: string) => snapshot(root),
    pickVault: () => pickVault(),
    watchVault: vi.fn(async () => {}),
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {}),
}));

import { useVault } from "./store";
import { lastPathKey } from "./last-note";

let api: ReturnType<typeof useVault>;
function Harness() {
  api = useVault();
  return null;
}

function seed() {
  files.clear();
  dirs.clear();
  files.set("a.md", "# A\nhello [[B]]\n");
  files.set("b.md", "# B\nback\n");
  dirs.add("notes");
  files.set("notes/c.md", "# C\n");
}

async function setup(root = "/v") {
  const view = render(<Harness />);
  await act(async () => {
    await api.actions.openVault(root);
  });
  return view;
}

describe("store vault lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    seed();
    writeNote.mockClear();
    createNoteIpc.mockClear();
    deleteNoteIpc.mockClear();
    renameNoteIpc.mockClear();
    restoreNoteIpc.mockClear();
    pickVault.mockClear();
    indexFail.current = false;
    writeFail.current = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("openVault 载入树并以首个文件为当前笔记", async () => {
    const view = await setup();
    expect(api.state.root).toBe("/v");
    expect(api.state.currentPath).toBe("a.md");
    expect(api.state.content).toContain("# A");
    expect(api.state.openPaths).toEqual(["a.md"]);
    expect(api.state.snapshot?.nodes.map((n) => n.path)).toEqual([
      "a.md",
      "b.md",
      "notes/c.md",
    ]);
    expect(localStorage.getItem("open-llm-wiki.lastRoot")).toBe("/v");
    view.unmount();
  });

  it("openVault 恢复仍存在的上次笔记,不存在则回退首篇", async () => {
    localStorage.setItem(lastPathKey("/v"), "notes/c.md");
    const view = await setup();
    expect(api.state.currentPath).toBe("notes/c.md");
    expect(api.state.content).toContain("# C");
    view.unmount();

    localStorage.setItem(lastPathKey("/v"), "gone.md");
    const view2 = render(<Harness />);
    await act(async () => {
      await api.actions.openVault("/v");
    });
    expect(api.state.currentPath).toBe("a.md");
    view2.unmount();
  });

  it("openVault 失败写入 error 并返回 false", async () => {
    indexFail.current = true;
    const view = render(<Harness />);
    let ok = true;
    await act(async () => {
      ok = await api.actions.openVault("/v");
    });
    expect(ok).toBe(false);
    expect(api.state.error).toMatch(/index boom/);
    expect(api.state.root).toBeNull();
    view.unmount();
  });

  it("selectNote 读盘、入打开列表、可后退", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    expect(api.state.currentPath).toBe("b.md");
    expect(api.state.content).toContain("# B");
    expect(api.state.openPaths).toEqual(["a.md", "b.md"]);
    expect(api.navInfo.canBack).toBe(true);
    await act(async () => {
      await api.actions.goBack();
    });
    expect(api.state.currentPath).toBe("a.md");
    expect(api.navInfo.canForward).toBe(true);
    await act(async () => {
      await api.actions.goForward();
    });
    expect(api.state.currentPath).toBe("b.md");
    view.unmount();
  });

  it("相同字节 setContent 不 dirty;改写后防抖落盘", async () => {
    const view = await setup();
    act(() => {
      api.actions.setContent(api.state.content);
    });
    expect(api.state.dirty).toBe(false);
    act(() => {
      api.actions.setContent("# A\nedited\n");
    });
    expect(api.state.dirty).toBe(true);
    expect(writeNote).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(writeNote).toHaveBeenCalledWith("/v", "a.md", "# A\nedited\n");
    expect(api.state.dirty).toBe(false);
    view.unmount();
  });

  it("saveNow 未脏不写;写失败记下 error", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.saveNow();
    });
    expect(writeNote).not.toHaveBeenCalled();
    act(() => {
      api.actions.setContent("dirty");
    });
    writeFail.current = true;
    await act(async () => {
      await api.actions.saveNow();
    });
    expect(api.state.error).toMatch(/write denied/);
    expect(api.state.saveState).toBe("idle");
    view.unmount();
  });

  it("createNote 落盘、选中、补 .md", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.createNote("New Note");
    });
    expect(createNoteIpc).toHaveBeenCalledWith(
      "/v",
      "New Note.md",
      expect.stringContaining("# New Note"),
    );
    expect(api.state.currentPath).toBe("New Note.md");
    expect(api.state.openPaths).toContain("New Note.md");
    view.unmount();
  });

  it("createDraftNote 避开已占用名", async () => {
    files.set("未命名.md", "# 未命名\n");
    const view = await setup();
    let path: string | null = null;
    await act(async () => {
      path = await api.actions.createDraftNote("未命名");
    });
    expect(path).toBe("未命名 1.md");
    view.unmount();
  });

  it("createNoteFromTemplate 替换 {{title}} / {{date}}", async () => {
    files.set("templates/hello.md", "Hi {{title}} on {{date}}\n");
    const view = await setup();
    await act(async () => {
      await api.actions.createNoteFromTemplate("FromTpl", "templates/hello.md");
    });
    const body = createNoteIpc.mock.calls.at(-1)?.[2] as string;
    expect(body).toMatch(/^Hi FromTpl on \d{4}-\d{2}-\d{2}$/m);
    expect(api.state.currentPath).toBe("FromTpl.md");
    view.unmount();
  });

  it("deleteNote 删当前页时切到邻居", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    await act(async () => {
      await api.actions.deleteNote("b.md");
    });
    expect(deleteNoteIpc).toHaveBeenCalledWith("/v", "b.md");
    expect(api.state.currentPath).toBe("a.md");
    expect(api.state.openPaths).not.toContain("b.md");
    view.unmount();
  });

  it("renameNote 改当前路径与打开列表,不丢正文", async () => {
    const view = await setup();
    const body = api.state.content;
    let to: string | null = null;
    await act(async () => {
      to = await api.actions.renameNote("a.md", "Alpha");
    });
    expect(to).toBe("Alpha.md");
    expect(api.state.currentPath).toBe("Alpha.md");
    expect(api.state.openPaths).toContain("Alpha.md");
    expect(api.state.openPaths).not.toContain("a.md");
    expect(api.state.content).toBe(body);
    view.unmount();
  });

  it("moveNote 拖到文件夹只改目录", async () => {
    const view = await setup();
    let to: string | null = null;
    await act(async () => {
      to = await api.actions.moveNote("a.md", "notes");
    });
    expect(to).toBe("notes/a.md");
    expect(renameNoteIpc).toHaveBeenCalledWith("/v", "a.md", "notes/a.md");
    expect(api.state.currentPath).toBe("notes/a.md");
    view.unmount();
  });

  it("closeTab / closeOthers / closeAllTabs / cycleTab / reorderTab", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    await act(async () => {
      await api.actions.selectNote("notes/c.md");
    });
    expect(api.state.openPaths).toEqual(["a.md", "b.md", "notes/c.md"]);
    act(() => {
      api.actions.reorderTab(0, 2);
    });
    expect(api.state.openPaths[2]).toBe("a.md");
    await act(async () => {
      await api.actions.cycleTab(-1);
    });
    expect(api.state.currentPath).toBe("b.md");
    await act(async () => {
      await api.actions.closeTab("b.md");
    });
    expect(api.state.openPaths).not.toContain("b.md");
    await act(async () => {
      await api.actions.closeOthers(api.state.currentPath ?? "");
    });
    expect(api.state.openPaths).toHaveLength(1);
    await act(async () => {
      await api.actions.closeAllTabs();
    });
    expect(api.state.openPaths).toEqual([]);
    expect(api.state.currentPath).toBeNull();
    view.unmount();
  });

  it("setNoteStatus 写当前笔记 frontmatter 并清 dirty", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.setNoteStatus("a.md", "Active");
    });
    expect(api.state.content).toMatch(/status:\s*Active/);
    expect(api.state.dirty).toBe(false);
    expect(writeNote).toHaveBeenCalled();
    view.unmount();
  });

  it("commitDraftRename 改文件名并把占位 H1 换成新名", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.createNote("未命名.md", "# 未命名\n\nbody\n");
    });
    await act(async () => {
      await api.actions.commitDraftRename("未命名.md", "日报");
    });
    expect(api.state.currentPath).toBe("日报.md");
    expect(api.state.content.startsWith("# 日报\n")).toBe(true);
    view.unmount();
  });

  it("createCanvas / createSheet 用对扩展名打开空壳", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.createCanvas("board");
    });
    expect(api.state.currentPath).toBe("board.canvas");
    expect(createNoteIpc).toHaveBeenCalledWith("/v", "board.canvas", "");
    await act(async () => {
      await api.actions.createSheet("nums");
    });
    expect(api.state.currentPath).toBe("nums.sheet");
    expect(api.state.content).toContain("openLlmWikiSheet");
    view.unmount();
  });

  it("restoreNote 调 git 还原并刷新树", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.restoreNote("gone.md");
    });
    expect(restoreNoteIpc).toHaveBeenCalledWith("/v", "gone.md");
    expect(api.state.entries.some((e) => e.path === "gone.md")).toBe(true);
    view.unmount();
  });

  it("切 vault 清空导航历史;openPicker 走 pickVault", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    expect(api.navInfo.canBack).toBe(true);
    files.set("z.md", "# Z\n");
    await act(async () => {
      await api.actions.openVault("/other");
    });
    expect(api.state.root).toBe("/other");
    expect(api.navInfo.canBack).toBe(false);
    pickVault.mockResolvedValueOnce("/picked");
    files.set("p.md", "# P\n");
    await act(async () => {
      await api.actions.openPicker();
    });
    expect(pickVault).toHaveBeenCalled();
    expect(api.state.root).toBe("/picked");
    view.unmount();
  });

  it("当前笔记的反链来自 snapshot 入边", async () => {
    const view = await setup();
    await act(async () => {
      await api.actions.selectNote("b.md");
    });
    expect(api.currentNode?.path).toBe("b.md");
    expect(api.backlinks.map((b) => b.from.path)).toEqual(["a.md"]);
    view.unmount();
  });
});
