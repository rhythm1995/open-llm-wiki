/**
 * ErrorBoundary —— 子树抛错隔离;schema vs 普通文案;自定义 fallback。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary, isSchemaRenderError } from "./ErrorBoundary";

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe("isSchemaRenderError", () => {
  it("RangeError 或 schema 文案为真", () => {
    expect(isSchemaRenderError(new RangeError("out of range"))).toBe(true);
    expect(
      isSchemaRenderError(new Error("Invalid content for node paragraph")),
    ).toBe(true);
  });

  it("普通 Error 为假", () => {
    expect(isSchemaRenderError(new Error("cannot read foo"))).toBe(false);
  });
});

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("无错时渲染子节点", () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary")).toBeNull();
  });

  it("schema 崩溃用 schema 文案并回调 onError", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom error={new RangeError("Invalid content for node")} />
      </ErrorBoundary>,
    );
    const box = screen.getByTestId("error-boundary");
    expect(box).toHaveAttribute("data-kind", "schema");
    expect(box).toHaveTextContent(/代码块 \/ frontmatter/);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(RangeError);
  });

  it("普通崩溃用通用文案", () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error("cannot read foo")} />
      </ErrorBoundary>,
    );
    const box = screen.getByTestId("error-boundary");
    expect(box).toHaveAttribute("data-kind", "generic");
    expect(box).toHaveTextContent("已记录详细错误");
    expect(box).not.toHaveTextContent(/frontmatter/);
  });

  it("传入 fallback 时不挡全屏默认页", () => {
    render(
      <ErrorBoundary fallback={<div data-testid="local-fallback">broken</div>}>
        <Boom error={new Error("nope")} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("local-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary")).toBeNull();
  });

  it("展开详情露出 stack,复制写入剪贴板", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const err = new Error("cannot read foo");
    render(
      <ErrorBoundary>
        <Boom error={err} />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId("error-boundary-stack")).toBeNull();
    await user.click(screen.getByRole("button", { name: "展开详情" }));
    expect(screen.getByTestId("error-boundary-stack")).toHaveTextContent(
      "cannot read foo",
    );
    await user.click(screen.getByRole("button", { name: "复制" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Error: cannot read foo"),
    );
  });
});
