/**
 * Source Editor —— 空态、格式条落到 CM 正文、Find 句柄、插图按钮。
 * 真挂 CodeMirror(jsdom);不测主题色。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import type { TFunc } from "../lib/i18n";
import type { EditorHandle } from "./Editor";

const saveAttachment = vi.fn(async (..._args: unknown[]) => {});
const attachmentExistsAsync = vi.fn(async (..._args: unknown[]) => false);

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => true,
    saveAttachment: (...a: unknown[]) =>
      saveAttachment(...(a as [string, string, string])),
    attachmentExistsAsync: (...a: unknown[]) =>
      attachmentExistsAsync(...(a as [string, string])),
  },
}));

import { Editor } from "./Editor";

const t = ((key: string) => key) as TFunc;

function stubCmGeometry() {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 20,
    right: 20,
    width: 20,
    height: 20,
    toJSON() {
      return {};
    },
  } as DOMRect;
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => rect;
  }
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    }) as DOMRectList;
}

describe("Editor (source)", () => {
  const onChange = vi.fn();
  const onFollow = vi.fn();

  beforeEach(() => {
    stubCmGeometry();
    onChange.mockClear();
    onFollow.mockClear();
    saveAttachment.mockClear();
    attachmentExistsAsync.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("无笔记显示空态,不渲染格式条", () => {
    render(
      <Editor
        value=""
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote={false}
        theme="light"
        t={t}
      />,
    );
    expect(screen.getByText("empty.selectOrCreate")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-fmt-bar")).toBeNull();
  });

  it("有笔记时格式条粗体把选区包成 **", async () => {
    const user = userEvent.setup();
    render(
      <Editor
        value="hello"
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote
        theme="light"
        t={t}
      />,
    );
    expect(screen.getByTestId("editor-fmt-bar")).toBeInTheDocument();
    const cm = document.querySelector(".cm-content") as HTMLElement;
    expect(cm).toBeTruthy();
    await user.tripleClick(cm);
    await user.click(screen.getByTestId("editor-fmt-bold"));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain("**");
  });

  it("任务列表按钮给当前行加上 - [ ]", async () => {
    const user = userEvent.setup();
    render(
      <Editor
        value="item"
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote
        theme="light"
        t={t}
      />,
    );
    await user.click(screen.getByTestId("editor-fmt-task"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/- \[ \]/);
  });

  it("wikilink 按钮插入 [[ ]]", async () => {
    const user = userEvent.setup();
    render(
      <Editor
        value=""
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={["Zettel"]}
        root="/v"
        hasNote
        theme="light"
        t={t}
      />,
    );
    await user.click(screen.getByTestId("editor-fmt-wikilink"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("[[");
  });

  it("handle.find / replaceAll / scrollToLine 不抛", async () => {
    const ref = createRef<EditorHandle>();
    render(
      <Editor
        ref={ref}
        value={"one two two\n# Head"}
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote
        theme="light"
        t={t}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => {
      expect(ref.current?.find("two")).toBe(true);
      expect(ref.current?.replaceAll("two", "2")).toBeGreaterThan(0);
      ref.current?.scrollToLine(2);
      ref.current?.clearFind();
    });
  });

  it("插图按钮点开隐藏的 file input", async () => {
    const user = userEvent.setup();
    render(
      <Editor
        value=""
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote
        theme="light"
        t={t}
        notePath="a.md"
      />,
    );
    const input = screen.getByTestId("editor-image-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByTestId("editor-insert-image"));
    expect(click).toHaveBeenCalled();
  });

  it("正文右键弹出格式菜单,点粗体改选区", async () => {
    const user = userEvent.setup();
    render(
      <Editor
        value="hello"
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote
        theme="light"
        t={t}
      />,
    );
    const cm = document.querySelector(".cm-content") as HTMLElement;
    fireEvent.contextMenu(cm);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.tripleClick(cm);
    await user.click(screen.getByRole("menuitem", { name: "editor.fmt.bold" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("**");
  });

  it("拖入图片走 saveAttachment 并插入 markdown", async () => {
    saveAttachment.mockResolvedValue(undefined);
    attachmentExistsAsync.mockResolvedValue(false);
    render(
      <Editor
        value=""
        onChange={onChange}
        onFollow={onFollow}
        noteTitles={[]}
        root="/v"
        hasNote
        theme="light"
        t={t}
        notePath="a.md"
      />,
    );
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", {
      type: "image/png",
    });
    const host = screen.getByTestId("source-editor");
    const dt = {
      files: [file],
      items: [
        { kind: "file", type: "image/png", getAsFile: () => file },
      ],
      types: ["Files"],
      dropEffect: "copy",
    };
    fireEvent.dragEnter(host, { dataTransfer: dt });
    expect(screen.getByText("editor.dropImage")).toBeInTheDocument();
    fireEvent.drop(host, { dataTransfer: dt });
    await waitFor(() => expect(saveAttachment).toHaveBeenCalled());
    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as string | undefined;
      expect(last).toMatch(/!\[.*\]\(.+\.png\)/);
    });
  });
});
