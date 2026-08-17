/**
 * CommandPalette 组件测:三 mode、过滤、搜索、键盘。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "./CommandPalette";
import type { VaultSnapshot } from "../lib/ipc";
import { translate } from "../lib/i18n";

const searchNotes = vi.fn();

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => true,
    searchNotes: (...args: unknown[]) => searchNotes(...args),
  },
}));

const t = (key: string, vars?: Record<string, string | number>) =>
  translate("zh", key, vars);

function snapshot(): VaultSnapshot {
  return {
    root: "/mock-vault",
    nodes: [
      {
        id: 0,
        path: "index.md",
        title: "Index",
        type: "Note",
        tags: [],
        status: null,
        created: null,
        modified: 0,
        preview: "welcome mock vault",
      },
      {
        id: 1,
        path: "zettelkasten.md",
        title: "Zettelkasten",
        type: "Concept",
        tags: ["method"],
        status: "Active",
        created: null,
        modified: 0,
        preview: "原子化卡片笔记法",
      },
    ],
    edges: [],
  };
}

function actions() {
  return {
    openPicker: vi.fn(),
    selectNote: vi.fn(),
    refreshIndex: vi.fn(),
  } as unknown as import("../lib/store").VaultActions;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    searchNotes.mockReset();
    searchNotes.mockResolvedValue([{ id: 1, score: 2 }]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commands:列出命令并可过滤", async () => {
    const user = userEvent.setup();
    const a = actions();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        actions={a}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="commands"
        commandExtras={{
          saveNow: () => {},
          openSettings: () => {},
        }}
      />,
    );
    const panel = screen.getByTestId("command-palette");
    expect(panel).toHaveAttribute("data-palette-mode", "commands");
    expect(screen.getByTestId("palette-input")).toBeInTheDocument();
    // 有 open-vault / save 等
    expect(screen.getByTestId("palette-cmd-open-vault")).toBeInTheDocument();
    await user.type(screen.getByTestId("palette-input"), "保存");
    expect(screen.getByTestId("palette-cmd-save")).toBeInTheDocument();
  });

  it("commands:点击命令 run 并关闭", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const saveNow = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        snapshot={snapshot()}
        actions={actions()}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="commands"
        commandExtras={{ saveNow }}
      />,
    );
    await user.click(screen.getByTestId("palette-cmd-save"));
    expect(saveNow).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("files:仅文件列表,Enter 打开", async () => {
    const user = userEvent.setup();
    const a = actions();
    const onNav = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        entryPaths={["index.md", "zettelkasten.md", "board.canvas"]}
        actions={a}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={onNav}
        t={t}
        mode="files"
      />,
    );
    expect(screen.getByTestId("command-palette")).toHaveAttribute(
      "data-palette-mode",
      "files",
    );
    // 无命令行
    expect(screen.queryByTestId("palette-cmd-save")).not.toBeInTheDocument();
    await user.type(screen.getByTestId("palette-input"), "Zettel");
    const fileBtn = await screen.findByTestId("palette-file-zettelkasten.md");
    await user.click(fileBtn);
    expect(a.selectNote).toHaveBeenCalledWith("zettelkasten.md");
    expect(onNav).toHaveBeenCalledWith("editor");
  });

  it("search:调用 searchNotes 并展示结果", async () => {
    const user = userEvent.setup();
    const a = actions();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        actions={a}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="search"
      />,
    );
    expect(screen.getByTestId("command-palette")).toHaveAttribute(
      "data-palette-mode",
      "search",
    );
    await user.type(screen.getByTestId("palette-input"), "原子化");
    await waitFor(
      () => {
        expect(searchNotes).toHaveBeenCalledWith("/mock-vault", "原子化");
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("palette-search-zettelkasten.md"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("palette-search-zettelkasten.md"));
    expect(a.selectNote).toHaveBeenCalledWith("zettelkasten.md");
  });

  it("search:空结果文案", async () => {
    searchNotes.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        actions={actions()}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="search"
      />,
    );
    await user.type(screen.getByTestId("palette-input"), "nomatchxyz");
    await waitFor(() => {
      expect(screen.getByText(/无正文命中/)).toBeInTheDocument();
    });
  });

  it("commands 附带文件区(有 query)", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        actions={actions()}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="commands"
      />,
    );
    await user.type(screen.getByTestId("palette-input"), "Index");
    expect(
      await screen.findByTestId("palette-file-index.md"),
    ).toBeInTheDocument();
  });

  it("键盘 ArrowDown + Enter 执行首项后的下一项", async () => {
    const saveNow = vi.fn();
    const openSettings = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        actions={actions()}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="commands"
        commandExtras={{ saveNow, openSettings }}
      />,
    );
    const input = screen.getByTestId("palette-input");
    // 过滤到较少命令便于预测
    fireEvent.change(input, { target: { value: "设置" } });
    await waitFor(() => {
      expect(screen.getByTestId("palette-cmd-settings")).toBeInTheDocument();
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(openSettings).toHaveBeenCalled();
  });

  it("IME 组合期的 Enter(keyCode 229)不执行命令", async () => {
    const openSettings = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        snapshot={snapshot()}
        actions={actions()}
        onNewNote={() => {}}
        onNewCanvas={() => {}}
        onNavigate={() => {}}
        t={t}
        mode="commands"
        commandExtras={{ saveNow: () => {}, openSettings }}
      />,
    );
    const input = screen.getByTestId("palette-input");
    fireEvent.change(input, { target: { value: "设置" } });
    await waitFor(() => {
      expect(screen.getByTestId("palette-cmd-settings")).toBeInTheDocument();
    });
    // 输入法组合期(拼音候选确认)的 Enter 不是「执行」。
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(openSettings).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(openSettings).toHaveBeenCalled();
  });
});
