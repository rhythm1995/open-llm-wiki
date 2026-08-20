/**
 * FindBar —— 文档内查找/替换条。计数走 find-in-doc;跳转/替换经 EditorHandle。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindBar } from "./FindBar";
import type { EditorHandle } from "./Editor";
import type { TFunc } from "../lib/i18n";

const t = ((key: string) => key) as TFunc;

function handle(): EditorHandle {
  return {
    scrollToLine: vi.fn(),
    find: vi.fn(() => true),
    clearFind: vi.fn(),
    replaceNext: vi.fn(() => true),
    replaceAll: vi.fn(() => 2),
    pickAndInsertImages: vi.fn(),
  };
}

describe("FindBar", () => {
  let editor: EditorHandle;
  const onQueryChange = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    editor = handle();
    onQueryChange.mockClear();
    onClose.mockClear();
  });

  function mount(query = "foo", documentText = "foo bar foo") {
    return render(
      <FindBar
        query={query}
        onQueryChange={onQueryChange}
        onClose={onClose}
        t={t}
        editor={editor}
        documentText={documentText}
      />,
    );
  }

  it("有查询时展示匹配计数", () => {
    mount("foo", "foo bar foo");
    expect(screen.getByTestId("find-count")).toHaveTextContent("2");
  });

  it("零匹配显示 none 文案", () => {
    mount("zzz", "foo");
    expect(screen.getByTestId("find-count")).toHaveTextContent("find.none");
  });

  it("空查询不显示计数并 clearFind", () => {
    mount("", "foo");
    expect(screen.queryByTestId("find-count")).toBeNull();
    expect(editor.clearFind).toHaveBeenCalled();
  });

  it("下一 / 上一调用 editor.find", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "find.next" }));
    expect(editor.find).toHaveBeenCalledWith("foo", false);
    await user.click(screen.getByRole("button", { name: "find.prev" }));
    expect(editor.find).toHaveBeenCalledWith("foo", true);
  });

  it("Enter 找下一处,Shift+Enter 找上一处", () => {
    mount();
    const input = screen.getByTestId("find-query");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(editor.find).toHaveBeenCalledWith("foo", false);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(editor.find).toHaveBeenCalledWith("foo", true);
  });

  it("IME 组合期 Enter 不查找", () => {
    mount();
    vi.mocked(editor.find).mockClear();
    fireEvent.keyDown(screen.getByTestId("find-query"), {
      key: "Enter",
      keyCode: 229,
    });
    expect(editor.find).not.toHaveBeenCalled();
  });

  it("Escape 关闭", () => {
    mount();
    fireEvent.keyDown(screen.getByTestId("find-query"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("展开替换后 replace / replace all 走句柄", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByTestId("find-toggle-replace"));
    await user.type(screen.getByTestId("find-replace"), "bar");
    await user.click(screen.getByTestId("find-replace-one"));
    expect(editor.replaceNext).toHaveBeenCalledWith("foo", "bar");
    await user.click(screen.getByTestId("find-replace-all"));
    expect(editor.replaceAll).toHaveBeenCalledWith("foo", "bar");
  });

  it("无 editor 时替换按钮禁用", async () => {
    const user = userEvent.setup();
    render(
      <FindBar
        query="foo"
        onQueryChange={onQueryChange}
        onClose={onClose}
        t={t}
        editor={null}
        documentText="foo"
      />,
    );
    await user.click(screen.getByTestId("find-toggle-replace"));
    expect(screen.getByTestId("find-replace-one")).toBeDisabled();
    expect(screen.getByTestId("find-replace-all")).toBeDisabled();
  });
});
