import { describe, it, expect } from "vitest";
import { hasAgentMark } from "./agent-icons";

describe("agent-icons", () => {
  it("内置 agent id 有专用标(含常见别名)", () => {
    expect(hasAgentMark("claude-code")).toBe(true);
    expect(hasAgentMark("claude-desktop")).toBe(true);
    expect(hasAgentMark("cursor")).toBe(true);
    expect(hasAgentMark("opencode")).toBe(true);
    expect(hasAgentMark("codex")).toBe(true);
    expect(hasAgentMark("windsurf")).toBe(true);
    expect(hasAgentMark("zed")).toBe(true);
    expect(hasAgentMark("grok")).toBe(true);
    expect(hasAgentMark("grok-build")).toBe(true);
    expect(hasAgentMark("pi")).toBe(true);
  });

  it("未知 id 无专用标(组件仍会回退通用机器人)", () => {
    expect(hasAgentMark("unknown-agent-xyz")).toBe(false);
  });
});
