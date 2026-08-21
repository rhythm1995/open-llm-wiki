/**
 * ConflictNotice —— 冲突副本提示卡(doc 17 G5)。
 * 有对渲染;打开按钮回调;「忽略此项」按 root 持久化并即时消失。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConflictNotice } from "./ConflictNotice";
import type { TFunc } from "../lib/i18n";

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key;
  return `${key} ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")}`;
}) as TFunc;

const pairs = [
  { base: "Note.md", copy: "Note 2.md" },
  { base: "sub/D.md", copy: "sub/D 3.md" },
];

describe("ConflictNotice", () => {
  beforeEach(() => localStorage.clear());

  it("无对/空对不渲染", () => {
    const { container } = render(
      <ConflictNotice root="/v" pairs={[]} t={t} onOpenNote={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("列出冲突对,标题带数量", () => {
    render(<ConflictNotice root="/v" pairs={pairs} t={t} onOpenNote={vi.fn()} />);
    expect(screen.getByTestId("conflict-notice")).toBeInTheDocument();
    expect(screen.getByText(/^conflict\.title/)).toHaveTextContent("n=2");
    expect(screen.getAllByTestId("conflict-row")).toHaveLength(2);
  });

  it("打开原文件/副本回调带路径", () => {
    const onOpenNote = vi.fn();
    render(<ConflictNotice root="/v" pairs={pairs} t={t} onOpenNote={onOpenNote} />);
    fireEvent.click(screen.getAllByTestId("conflict-open-base")[0]);
    expect(onOpenNote).toHaveBeenCalledWith("Note.md");
    fireEvent.click(screen.getAllByTestId("conflict-open-copy")[1]);
    expect(onOpenNote).toHaveBeenCalledWith("sub/D 3.md");
  });

  it("忽略一项:即时消失且重挂载仍忽略;另一项保留", () => {
    const first = render(
      <ConflictNotice root="/v" pairs={pairs} t={t} onOpenNote={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByTestId("conflict-ignore")[0]);
    expect(first.getAllByTestId("conflict-row")).toHaveLength(1);
    first.unmount();
    // 重新挂载(重开 app):被忽略项不再出现。
    const second = render(
      <ConflictNotice root="/v" pairs={pairs} t={t} onOpenNote={vi.fn()} />,
    );
    expect(second.getAllByTestId("conflict-row")).toHaveLength(1);
    expect(second.getByText(/sub\/D 3\.md/)).toBeInTheDocument();
  });
});
