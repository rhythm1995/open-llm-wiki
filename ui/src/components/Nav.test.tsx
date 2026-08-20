/**
 * Nav —— 左栏智能视图 / TYPES / TAGS / FOLDERS。
 * 锁筛选回调与计数;不测图标色。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Nav } from "./Nav";
import type { NodeOut, VaultEntry, VaultSnapshot } from "../lib/ipc";
import type { TFunc } from "../lib/i18n";

const t = ((key: string) => key) as TFunc;

function node(over: Partial<NodeOut>): NodeOut {
  return {
    id: 0,
    path: "",
    title: "",
    type: null,
    tags: [],
    status: null,
    created: null,
    modified: 0,
    preview: "",
    ...over,
  };
}

const entries: VaultEntry[] = [
  { path: "proj", name: "proj", is_dir: true },
  { path: "proj/a.md", name: "a.md", is_dir: false },
  { path: "inbox.md", name: "inbox.md", is_dir: false },
];

const snapshot: VaultSnapshot = {
  root: "/v",
  nodes: [
    node({
      id: 1,
      path: "inbox.md",
      title: "Inbox",
      type: null,
      tags: ["alpha"],
    }),
    node({
      id: 2,
      path: "proj/a.md",
      title: "Alpha",
      type: "Concept",
      tags: ["alpha", "beta"],
    }),
  ],
  edges: [],
};

describe("Nav", () => {
  it("无 snapshot 显示空态", () => {
    render(
      <Nav
        entries={[]}
        snapshot={null}
        navSelection={null}
        onNavSelect={vi.fn()}
        isEditorView
        t={t}
      />,
    );
    expect(screen.getByText("sidebar.empty")).toBeInTheDocument();
  });

  it("Inbox / All / Archive 点击设筛选;All 计数为节点总数", async () => {
    const user = userEvent.setup();
    const onNavSelect = vi.fn();
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={null}
        onNavSelect={onNavSelect}
        isEditorView
        t={t}
      />,
    );
    expect(screen.getByTestId("nav-all")).toHaveTextContent("2");
    await user.click(screen.getByTestId("nav-inbox"));
    expect(onNavSelect).toHaveBeenCalledWith({ kind: "inbox" });
    await user.click(screen.getByTestId("nav-all"));
    expect(onNavSelect).toHaveBeenCalledWith({ kind: "all" });
    await user.click(screen.getByTestId("nav-archive"));
    expect(onNavSelect).toHaveBeenCalledWith({ kind: "archive" });
  });

  it("TYPES 去重计数;点 type 行筛选", async () => {
    const user = userEvent.setup();
    const onNavSelect = vi.fn();
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={null}
        onNavSelect={onNavSelect}
        isEditorView
        t={t}
      />,
    );
    expect(screen.getByTestId("nav-type-Concept")).toHaveTextContent("1");
    expect(screen.getByTestId("nav-type-untyped")).toHaveTextContent("1");
    await user.click(screen.getByTestId("nav-type-Concept"));
    expect(onNavSelect).toHaveBeenCalledWith({ kind: "type", id: "Concept" });
  });

  it("TAGS 显示 #tag 与计数", async () => {
    const user = userEvent.setup();
    const onNavSelect = vi.fn();
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={null}
        onNavSelect={onNavSelect}
        isEditorView
        t={t}
      />,
    );
    expect(screen.getByTestId("nav-tag-alpha")).toHaveTextContent("2");
    expect(screen.getByTestId("nav-tag-beta")).toHaveTextContent("1");
    await user.click(screen.getByTestId("nav-tag-beta"));
    expect(onNavSelect).toHaveBeenCalledWith({ kind: "tag", id: "beta" });
  });

  it("点文件夹筛选该目录", async () => {
    const user = userEvent.setup();
    const onNavSelect = vi.fn();
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={null}
        onNavSelect={onNavSelect}
        isEditorView
        t={t}
      />,
    );
    await user.click(screen.getByTestId("nav-section-folders"));
    await user.click(screen.getByTestId("nav-folder-proj"));
    expect(onNavSelect).toHaveBeenCalledWith({ kind: "folder", id: "proj" });
  });

  it("笔记拖到文件夹回调 from + 目标目录", async () => {
    const onMoveNote = vi.fn();
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={null}
        onNavSelect={vi.fn()}
        isEditorView
        onMoveNote={onMoveNote}
        t={t}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("nav-section-folders"));
    const folder = screen.getByTestId("nav-folder-proj").parentElement;
    expect(folder).toBeTruthy();
    fireEvent.drop(folder as HTMLElement, {
      dataTransfer: {
        getData: (type: string) =>
          type === "application/x-open-llm-wiki-note" ? "inbox.md" : "",
      },
    });
    expect(onMoveNote).toHaveBeenCalledWith("inbox.md", "proj");
  });

  it("非 editor 视图不高亮当前筛选", () => {
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={{ kind: "all" }}
        onNavSelect={vi.fn()}
        isEditorView={false}
        t={t}
      />,
    );
    expect(screen.getByTestId("nav-all").className).not.toMatch(/bg-surface2/);
  });

  it("折叠 TYPES 后类型行消失", async () => {
    const user = userEvent.setup();
    render(
      <Nav
        entries={entries}
        snapshot={snapshot}
        navSelection={null}
        onNavSelect={vi.fn()}
        isEditorView
        t={t}
      />,
    );
    expect(screen.getByTestId("nav-type-Concept")).toBeInTheDocument();
    await user.click(screen.getByTestId("nav-section-types"));
    expect(screen.queryByTestId("nav-type-Concept")).toBeNull();
  });
});
