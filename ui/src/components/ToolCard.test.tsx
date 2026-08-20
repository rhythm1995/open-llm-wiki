/**
 * ToolCard —— 失败自动展开;长输出二级折叠;完成默认折叠。
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolCard } from "./ToolCard";
import type { ToolRecord } from "../lib/agent-session";

function rec(over: Partial<ToolRecord>): ToolRecord {
  return {
    id: "t1",
    title: "read_note",
    status: "completed",
    text: "",
    locations: [],
    ...over,
  };
}

describe("ToolCard", () => {
  it("完成态默认折叠,只露标题", () => {
    render(
      <ToolCard
        rec={rec({ text: "full body of the tool output", locations: ["a.md"] })}
      />,
    );
    expect(screen.getByTestId("tool-card")).toHaveAttribute(
      "data-status",
      "completed",
    );
    expect(screen.getByText("read_note")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.queryByText("full body of the tool output")).toBeNull();
  });

  it("点标题行展开正文", async () => {
    const user = userEvent.setup();
    render(<ToolCard rec={rec({ text: "hello tool" })} />);
    await user.click(screen.getByTestId("tool-card-toggle"));
    expect(screen.getByText("hello tool")).toBeInTheDocument();
  });

  it("失败自动展开", () => {
    render(
      <ToolCard
        rec={rec({ status: "failed", title: "write_note", text: "EACCES" })}
      />,
    );
    expect(screen.getByTestId("tool-card")).toHaveAttribute(
      "data-status",
      "failed",
    );
    expect(screen.getByText("EACCES")).toBeInTheDocument();
  });

  it("长输出默认截断,点展开全部", async () => {
    const user = userEvent.setup();
    const text = "x".repeat(200);
    render(<ToolCard rec={rec({ status: "failed", text })} />);
    expect(screen.getByText(/…$/)).toBeInTheDocument();
    expect(screen.queryByText(text)).toBeNull();
    await user.click(screen.getByTestId("tool-card-more"));
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
