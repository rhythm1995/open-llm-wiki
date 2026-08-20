/**
 * TabBar 组件测试 —— 验证组件测试 pattern(props-driven,mock actions)。
 *
 * TabBar 是纯展示组件:标题来自快照,行为(selectNote/closeTab/reorderTab)走 props。
 * 无 ipc 依赖,无需 vi.mock。覆盖:空态、标题渲染与回退、激活态、点击激活、× 关闭。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";
import type { VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { TFunc } from "../lib/i18n";

// fake t:返回 key(+ 参数),让断言能定位渲染出的文案,不依赖具体 locale。
const t = ((key: string, params?: Record<string, string | number>) => {
  if (!params) return key;
  return `${key} ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(" ")}`;
}) as TFunc;

function snapshot(titles: Record<string, string>): VaultSnapshot {
  return {
    root: "/v",
    nodes: Object.entries(titles).map(([path, title], i) => ({
      id: i,
      path,
      title,
      type: null,
      tags: [],
      status: null,
      created: null,
      modified: 0,
      preview: "",
    })),
    edges: [],
  };
}

function actions(overrides: Partial<VaultActions> = {}): VaultActions {
  return {
    selectNote: vi.fn(),
    closeTab: vi.fn(),
    reorderTab: vi.fn(),
    ...overrides,
  } as unknown as VaultActions;
}

describe("TabBar", () => {
  it("无打开页时不渲染", () => {
    const { container } = render(
      <TabBar openPaths={[]} activePath={null} snapshot={null} actions={actions()} t={t} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("渲染各页标题(取自快照)", () => {
    render(
      <TabBar
        openPaths={["a.md", "b.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha", "b.md": "Beta" })}
        actions={actions()}
        t={t}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("快照缺标题时回退到文件名", () => {
    render(
      <TabBar
        openPaths={["deep/x.md"]}
        activePath="deep/x.md"
        snapshot={snapshot({})}
        actions={actions()}
        t={t}
      />,
    );
    expect(screen.getByText("x.md")).toBeInTheDocument();
  });

  it("点击页签调用 selectNote(path)", async () => {
    const a = actions();
    render(
      <TabBar
        openPaths={["a.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha" })}
        actions={a}
        t={t}
      />,
    );
    await userEvent.setup().click(screen.getByText("Alpha"));
    expect(a.selectNote).toHaveBeenCalledWith("a.md");
  });

  it("点 × 关闭调用 closeTab,且不触发 selectNote", async () => {
    const a = actions();
    render(
      <TabBar
        openPaths={["a.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha" })}
        actions={a}
        t={t}
      />,
    );
    // × 钮的 accessible name 来自 title=t("common.close")。
    await userEvent.setup().click(screen.getByRole("button", { name: "common.close" }));
    expect(a.closeTab).toHaveBeenCalledWith("a.md");
    expect(a.selectNote).not.toHaveBeenCalled();
  });

  it("中键关闭当前页", () => {
    const a = actions();
    render(
      <TabBar
        openPaths={["a.md", "b.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha", "b.md": "Beta" })}
        actions={a}
        t={t}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Beta/ }), { button: 1 });
    expect(a.closeTab).toHaveBeenCalledWith("b.md");
  });

  it("右键关闭其它页,单项时该项禁用", async () => {
    const user = userEvent.setup();
    const a = actions();
    const { rerender } = render(
      <TabBar
        openPaths={["a.md", "b.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha", "b.md": "Beta" })}
        actions={a}
        t={t}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Alpha/ }));
    await user.click(screen.getByRole("menuitem", { name: "tab.menu.closeOthers" }));
    expect(a.closeTab).toHaveBeenCalledWith("b.md");
    expect(a.closeTab).not.toHaveBeenCalledWith("a.md");

    rerender(
      <TabBar
        openPaths={["a.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha" })}
        actions={a}
        t={t}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Alpha/ }));
    expect(screen.getByRole("menuitem", { name: "tab.menu.closeOthers" })).toBeDisabled();
  });

  it("右键复制路径写入剪贴板", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <TabBar
        openPaths={["dir/a.md"]}
        activePath="dir/a.md"
        snapshot={snapshot({ "dir/a.md": "Alpha" })}
        actions={actions()}
        t={t}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Alpha/ }));
    await user.click(screen.getByRole("menuitem", { name: "tab.menu.copyPath" }));
    expect(writeText).toHaveBeenCalledWith("dir/a.md");
  });

  it("拖到另一页调用 reorderTab", () => {
    const a = actions();
    render(
      <TabBar
        openPaths={["a.md", "b.md"]}
        activePath="a.md"
        snapshot={snapshot({ "a.md": "Alpha", "b.md": "Beta" })}
        actions={a}
        t={t}
      />,
    );
    const from = screen.getByRole("tab", { name: /Alpha/ });
    const to = screen.getByRole("tab", { name: /Beta/ });
    const dt = {
      setData: vi.fn(),
      effectAllowed: "all",
      dropEffect: "move",
    };
    fireEvent.dragStart(from, { dataTransfer: dt });
    fireEvent.dragOver(to, { dataTransfer: dt });
    fireEvent.drop(to, { dataTransfer: dt });
    expect(a.reorderTab).toHaveBeenCalledWith(0, 1);
  });
});
