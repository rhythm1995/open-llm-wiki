import { describe, it, expect } from "vitest";
import {
  parseSessionUpdate,
  parseStatus,
  normalizeForHandoff,
} from "./agent-session";

describe("parseStatus", () => {
  it("maps PascalCase wire values", () => {
    expect(parseStatus("Completed")).toBe("completed");
    expect(parseStatus("Failed")).toBe("failed");
    expect(parseStatus("InProgress")).toBe("in_progress");
    expect(parseStatus("Pending")).toBe("pending");
    expect(parseStatus("Bogus")).toBeUndefined();
  });
});

describe("parseSessionUpdate", () => {
  it("extracts agent_message_chunk text", () => {
    const r = parseSessionUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hel" },
    });
    expect(r).toEqual({ kind: "agent_text", text: "hel" });
  });

  it("parses a tool_call into a ToolRecord", () => {
    const r = parseSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "tc-1",
      title: "Read note.md",
      status: "InProgress",
      content: [{ type: "text", text: "body" }],
      locations: [{ path: "note.md" }],
    });
    expect(r.kind).toBe("tool_new");
    if (r.kind === "tool_new") {
      expect(r.rec).toEqual({
        id: "tc-1",
        title: "Read note.md",
        status: "in_progress",
        text: "body",
        locations: ["note.md"],
      });
    }
  });

  it("parses a tool_call_update patch", () => {
    const r = parseSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "tc-1",
      status: "Completed",
    });
    expect(r).toEqual({ kind: "tool_patch", id: "tc-1", patch: { status: "completed" } });
  });

  it("parses usage_update into used/size; ignores available_commands noise", () => {
    expect(
      parseSessionUpdate({ sessionUpdate: "usage_update", used: 53000, size: 200000 }),
    ).toEqual({ kind: "usage", used: 53000, size: 200000 });
    // 缺字段回落 0,仍归一成 usage(UI 用默认窗口)。
    expect(parseSessionUpdate({ sessionUpdate: "usage_update" })).toEqual({
      kind: "usage",
      used: 0,
      size: 0,
    });
    expect(
      parseSessionUpdate({ sessionUpdate: "available_commands_update" }),
    ).toEqual({ kind: "ignore" });
  });
});

describe("normalizeForHandoff", () => {
  it("keeps user/agent text, compresses tools, drops nothing essential", () => {
    const md = normalizeForHandoff(
      [
        { role: "user", text: "fix the bug" },
        { role: "agent", text: "ok" },
        { role: "tool", text: "Read a.md · completed" },
      ],
      "opencode",
      "# 当前笔记\n...",
    );
    expect(md).toContain("承接自 opencode");
    expect(md).toContain("**我:** fix the bug");
    expect(md).toContain("**opencode:** ok");
    expect(md).toContain("- 工具:Read a.md · completed");
    expect(md).toContain("当前 vault 上下文");
  });
});
