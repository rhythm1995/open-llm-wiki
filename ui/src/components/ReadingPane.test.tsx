/**
 * ReadingPane —— 空态;markdown 管线;wikilink 委托;陈旧渲染丢弃。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunc } from "../lib/i18n";
import type { MediaSnapshot } from "../lib/ipc";
import { createEmptySheet, serializeSheet, setCell } from "../lib/sheet";

const readNote = vi.fn(async (..._args: unknown[]) => "");
const mediaIndex = vi.fn(async (..._args: unknown[]) => emptyMedia());
const resolveMediaUrl = vi.fn(
  (root: string, rel: string) => `asset://${root}/${rel}`,
);

vi.mock("../lib/ipc", () => ({
  ipc: {
    readNote: (...a: unknown[]) => readNote(...a),
    mediaIndex: (...a: unknown[]) => mediaIndex(...a),
    resolveMediaUrl: (root: string, rel: string) => resolveMediaUrl(root, rel),
  },
}));

import { ReadingPane } from "./ReadingPane";

const t = ((key: string) => key) as TFunc;

function emptyMedia(files: string[] = []): MediaSnapshot {
  return {
    files,
    orphans: [],
    missing: [],
    stats: {
      files: files.length,
      notes_with_media: 0,
      refs: 0,
      orphans: 0,
      missing: 0,
    },
  };
}

describe("ReadingPane", () => {
  beforeEach(() => {
    readNote.mockReset();
    mediaIndex.mockReset();
    resolveMediaUrl.mockClear();
    readNote.mockResolvedValue("");
    mediaIndex.mockResolvedValue(emptyMedia());
  });

  it("无笔记显示空态,不打 ipc", () => {
    render(
      <ReadingPane
        content="# Hello"
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote={false}
      />,
    );
    expect(screen.getByTestId("reading-pane")).toHaveTextContent(
      "empty.selectOrCreate",
    );
    expect(mediaIndex).not.toHaveBeenCalled();
    expect(readNote).not.toHaveBeenCalled();
  });

  it("无 root 不打 mediaIndex,仍渲染正文", async () => {
    render(
      <ReadingPane
        content="# Hello"
        root={null}
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument(),
    );
    expect(mediaIndex).not.toHaveBeenCalled();
    expect(readNote).not.toHaveBeenCalled();
  });

  it("渲染 markdown 标题", async () => {
    render(
      <ReadingPane
        content="# Hello"
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument(),
    );
  });

  it("点 wikilink 调 onFollow,普通链接不跟", async () => {
    const user = userEvent.setup();
    const onFollow = vi.fn();
    render(
      <ReadingPane
        content={"See [[Target|Alias]] and [ext](#ext)."}
        root="/v"
        onFollow={onFollow}
        t={t}
        hasNote
      />,
    );
    await waitFor(() => expect(screen.getByText("Alias")).toBeInTheDocument());
    await user.click(screen.getByText("ext"));
    expect(onFollow).not.toHaveBeenCalled();
    await user.click(screen.getByText("Alias"));
    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(onFollow).toHaveBeenCalledWith("Target");
  });

  it("相对图 src 经 resolveMediaUrl 改写", async () => {
    render(
      <ReadingPane
        content={"![shot](attachments/shot.png)"}
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "asset:///v/attachments/shot.png",
      ),
    );
    expect(resolveMediaUrl).toHaveBeenCalledWith("/v", "attachments/shot.png");
  });

  it("sheet 围栏缺文件时占位,readNote 抛错不炸", async () => {
    readNote.mockRejectedValue(new Error("ENOENT"));
    render(
      <ReadingPane
        content={"```sheet\npath: gone.sheet\n```"}
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("reading-pane")).toHaveTextContent(
        "sheet not found: gone.sheet",
      ),
    );
    expect(readNote).toHaveBeenCalledWith("/v", "gone.sheet");
  });

  it("sheet path 读到正文则嵌入求值结果", async () => {
    let doc = createEmptySheet();
    doc = setCell(doc, "A1", "4");
    doc = setCell(doc, "A2", "=A1*3");
    readNote.mockResolvedValue(serializeSheet(doc));
    render(
      <ReadingPane
        content={"```sheet\npath: n.sheet\n```"}
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("reading-pane")).toHaveTextContent("12"),
    );
  });

  it("mediaIndex 失败仍渲染正文", async () => {
    mediaIndex.mockRejectedValue(new Error("offline"));
    render(
      <ReadingPane
        content="# Still"
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Still" })).toBeInTheDocument(),
    );
  });

  it("切换内容时丢弃进行中的旧渲染", async () => {
    let release: (snap: MediaSnapshot) => void = () => {};
    mediaIndex.mockImplementationOnce(
      () =>
        new Promise<MediaSnapshot>((resolve) => {
          release = resolve;
        }),
    );
    const { rerender } = render(
      <ReadingPane
        content="# First"
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    mediaIndex.mockResolvedValue(emptyMedia());
    rerender(
      <ReadingPane
        content="# Second"
        root="/v"
        onFollow={vi.fn()}
        t={t}
        hasNote
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Second" }),
      ).toBeInTheDocument(),
    );
    release(emptyMedia());
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "First" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Second" })).toBeInTheDocument();
  });
});
