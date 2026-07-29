/**
 * NoteListView 组件测试 —— 列表渲染 pattern(props-driven 过滤 + 选中交互)。
 *
 * 覆盖默认全量分支:按 modified 倒序、点击选中、空态文案。query/archive 分支涉及
 * ipc 异步读盘,留作集成/e2e 场景,不在此 props-driven 单测里展开。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteListView } from "./NoteListView";
import type { VaultSnapshot, NodeOut } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { TFunc } from "../lib/i18n";

const t = ((key: string, params?: Record<string, string | number>) => {
  if (!params) return key;
  return `${key} ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(" ")}`;
}) as TFunc;

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

const snap = (nodes: NodeOut[]): VaultSnapshot => ({ root: "/v", nodes, edges: [] });
const actions = () => ({ selectNote: vi.fn() } as unknown as VaultActions);
// inline 重命名(任务3)默认 props:大部分用例不断言重命名,给齐即可过类型。
const renameProps = {
  renamingPath: null as string | null,
  onRenameCommit: () => {},
  onRenameCancel: () => {},
  onStartRename: () => {},
};

describe("NoteListView", () => {
  it("无 navSelection 时按 modified 倒序渲染全部节点", () => {
    render(
      <NoteListView
        root="/v"
        snapshot={snap([
          node({ id: 0, path: "old.md", title: "Old", modified: 1000 }),
          node({ id: 1, path: "new.md", title: "New", modified: 9000 }),
        ])}
        currentPath={null}
        navSelection={null}
        actions={actions()}
        {...renameProps}
        t={t}
      />,
    );
    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveTextContent("New");
    expect(rows[1]).toHaveTextContent("Old");
  });

  it("点击行调用 selectNote(path)", async () => {
    const a = actions();
    render(
      <NoteListView
        root="/v"
        snapshot={snap([node({ id: 0, path: "a.md", title: "Alpha", modified: 1 })])}
        currentPath={null}
        navSelection={null}
        actions={a}
        {...renameProps}
        t={t}
      />,
    );
    await userEvent.setup().click(screen.getByText("Alpha"));
    expect(a.selectNote).toHaveBeenCalledWith("a.md");
  });

  it("空快照显示空态文案", () => {
    render(
      <NoteListView
        root="/v"
        snapshot={snap([])}
        currentPath={null}
        navSelection={null}
        actions={actions()}
        {...renameProps}
        t={t}
      />,
    );
    expect(screen.getByText("list.empty.all")).toBeInTheDocument();
  });

  it("renamingPath 命中行渲染为输入框,回车提交重命名", async () => {
    const onRenameCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <NoteListView
        root="/v"
        snapshot={snap([node({ id: 0, path: "untitled.md", title: "未命名", modified: 1 })])}
        currentPath="untitled.md"
        navSelection={null}
        renamingPath="untitled.md"
        onRenameCommit={onRenameCommit}
        onRenameCancel={vi.fn()}
        onStartRename={vi.fn()}
        actions={actions()}
        t={t}
      />,
    );
    // 命中行是 input(非 button);未命中行仍为 button。
    const input = screen.getByDisplayValue("未命名");
    expect(input).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "我的笔记{Enter}");
    expect(onRenameCommit).toHaveBeenCalledWith("untitled.md", "我的笔记");
  });
});
