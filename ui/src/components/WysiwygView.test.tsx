/**
 * WysiwygView 组件测试 —— mock 掉 BlockNote 运行时,只测接线逻辑:
 * 空态、挂载时载入 body(剥离 frontmatter)、onChange 防抖回写合并 fm、防回环、卸载 flush。
 *
 * BlockNote 真实渲染 + md↔blocks round-trip + wikilink chip 由 e2e 覆盖(见 smoke.spec.ts);
 * wikilink hydrate/dehydrate 纯逻辑由 blocknote-wikilink.test.ts 覆盖。
 *
 * 注:content 必须用 JSX 表达式 `content={STR}` 传——JSX 字符串属性 `content="a\nb"`
 *   的 `\n` 是字面两字符(HTML 语义,不做 JS 转义),会破坏 frontmatter 围栏匹配。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// mock BlockNote 运行时(不进单测)。SuggestionMenuController 渲染为 null(不测 suggestion UI)。
const mockEditor = {
  tryParseMarkdownToBlocks: vi.fn((_md: string) => [] as unknown[]),
  replaceBlocks: vi.fn(),
  insertInlineContent: vi.fn(),
  document: [] as unknown[],
  blocksToMarkdownLossy: vi.fn(() => ""),
};
vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: () => mockEditor,
  SuggestionMenuController: () => null,
}));
vi.mock("@blocknote/mantine", () => ({
  // 渲染一个 div;click 它即模拟 BlockNote 文档变化 → 触发传入的 onChange。
  BlockNoteView: (props: { onChange: () => void; children?: React.ReactNode }) => (
    <div data-testid="bn-mock" onClick={props.onChange}>
      {props.children}
    </div>
  ),
}));
// schema 构造依赖真实 BlockNote 运行时,本测试不关心(schema 经 useCreateBlockNote mock 旁路);
// wikilink hydrate/dehydrate 由 blocknote-wikilink.test.ts 覆盖,IC 呈现由 e2e 覆盖。
vi.mock("./WysiwygWikilink", () => ({ wysiwygSchema: {} }));

import { WysiwygView } from "./WysiwygView";
import type { TFunc } from "../lib/i18n";

const t = ((k: string) => k) as unknown as TFunc;
const noop = () => {};

// JS 字符串字面量(`\n` 是换行);用 JSX 表达式传入。
const HEAD = "---\ntype: X\n---\n# 标题\n正文";
const OLD = "---\ntype: X\n---\n旧正文";
const PLAIN = "正文";

describe("WysiwygView", () => {
  it("hasNote=false 时显示空态", () => {
    render(
      <WysiwygView
        content={PLAIN}
        onChange={noop}
        onFollow={noop}
        noteTitles={[]}
        hasNote={false}
        theme="dark"
        t={t}
      />,
    );
    expect(screen.getByText("empty.selectOrCreate")).toBeInTheDocument();
  });

  it("挂载时把 body(已剥离 frontmatter)解析为块载入 editor", () => {
    mockEditor.tryParseMarkdownToBlocks.mockClear();
    render(
      <WysiwygView
        content={HEAD}
        onChange={noop}
        onFollow={noop}
        noteTitles={[]}
        hasNote={true}
        theme="light"
        t={t}
      />,
    );
    expect(mockEditor.tryParseMarkdownToBlocks).toHaveBeenCalledWith("# 标题\n正文");
  });

  it("BlockNote 变化后防抖回写,合并最新 fm + 新 body", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    mockEditor.blocksToMarkdownLossy.mockReturnValue("# 新正文\n");
    render(
      <WysiwygView
        content={OLD}
        onChange={onChange}
        onFollow={noop}
        noteTitles={[]}
        hasNote={true}
        theme="dark"
        t={t}
      />,
    );
    act(() => fireEvent.click(screen.getByTestId("bn-mock")));
    expect(onChange).not.toHaveBeenCalled(); // 防抖未到
    act(() => vi.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledWith("---\ntype: X\n---\n# 新正文\n");
    vi.useRealTimers();
  });

  it("序列化 body 与当前 body 一致时不回写(防自写回环)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    mockEditor.blocksToMarkdownLossy.mockReturnValue("旧正文");
    render(
      <WysiwygView
        content={OLD}
        onChange={onChange}
        onFollow={noop}
        noteTitles={[]}
        hasNote={true}
        theme="dark"
        t={t}
      />,
    );
    act(() => fireEvent.click(screen.getByTestId("bn-mock")));
    act(() => vi.advanceTimersByTime(400));
    expect(onChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("卸载时 flush 未触发的编辑(不丢输入)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    mockEditor.blocksToMarkdownLossy.mockReturnValue("编辑中");
    const { unmount } = render(
      <WysiwygView
        content={PLAIN}
        onChange={onChange}
        onFollow={noop}
        noteTitles={[]}
        hasNote={true}
        theme="dark"
        t={t}
      />,
    );
    act(() => fireEvent.click(screen.getByTestId("bn-mock")));
    // 防抖未到就卸载 → 应立即 flush,而非丢弃。
    act(() => unmount());
    expect(onChange).toHaveBeenCalledWith("编辑中");
    vi.useRealTimers();
  });
});
