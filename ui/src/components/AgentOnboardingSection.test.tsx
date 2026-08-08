/**
 * AgentOnboardingSection 测试 —— Settings「Agent 记忆接入」面板(B-MCP-ONBOARD 桌面侧)。
 *
 * 覆盖:mock 占位 / agent 行渲染与默认勾选 / 接入提交 / 拆线 / 诊断 /
 * 播种模板(带确认)/ 引导文本展开与复制 / 必填校验。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentOnboardingSection } from "./AgentOnboardingSection";
import type { TFunc } from "../lib/i18n";
import type { OnboardScan } from "../lib/ipc";

const scanFixture: OnboardScan = {
  home: "/home/u",
  resolved_binary: "/bin/openobs-mcp",
  guidance: "## OpenObsidian memory\nuse write_note etc.",
  agents: [
    {
      id: "claude-code",
      label: "Claude Code",
      present: true,
      evidence: ["binary on PATH: /bin/claude"],
      hints: [],
      config_path: "/home/u/.claude.json",
      note: "",
      manual_only: false,
      wired_command: "/bin/openobs-mcp",
      wired_vault: "/vault",
      config_error: null,
    },
    {
      id: "cursor",
      label: "Cursor",
      present: true,
      evidence: ["config exists: /home/u/.cursor/mcp.json"],
      hints: [],
      config_path: "/home/u/.cursor/mcp.json",
      note: "",
      manual_only: false,
      wired_command: null,
      wired_vault: null,
      config_error: null,
    },
    {
      id: "grok",
      label: "Grok CLI",
      present: true,
      evidence: ["binary on PATH: /bin/grok"],
      hints: [],
      config_path: null,
      note: "manual only",
      manual_only: true,
      wired_command: null,
      wired_vault: null,
      config_error: null,
    },
    {
      id: "zed",
      label: "Zed",
      present: false,
      evidence: [],
      hints: ["config dir exists: /home/u/.config/zed"],
      config_path: "/home/u/.config/zed/settings.json",
      note: "",
      manual_only: false,
      wired_command: null,
      wired_vault: null,
      config_error: null,
    },
  ],
};

const onboardApply = vi.fn(
  async (_binary: string, _vault: string, _agentIds: string[], _dryRun?: boolean) => [
    { id: "claude-code", ok: true, message: "wrote /home/u/.claude.json" },
    { id: "cursor", ok: false, message: "cannot parse" },
  ],
);
const onboardRemove = vi.fn(async (_agentIds: string[]) => [
  { id: "claude-code", ok: true, message: "removed" },
]);
const onboardDoctor = vi.fn(async (_vault: string, _binary?: string | null) => [
  { name: "vault", status: "ok" as const, detail: "/vault" },
  { name: "notes", status: "fail" as const, detail: "no notes" },
]);
const onboardInit = vi.fn(async (_dir: string, _force?: boolean) => ({
  written: ["index.md", "README.md"],
  skipped: ["types/concept.md"],
}));
const onboardScan = vi.fn(async () => scanFixture);
const onboardGuidance = vi.fn(async () => scanFixture.guidance);
const onboardPickBinary = vi.fn(async () => "/picked/openobs-mcp");

/** vi.mock 工厂被提升,用 hoisted 容器让个别用例切换 mock 模式。 */
const flags = vi.hoisted(() => ({ mock: false }));

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => flags.mock,
    onboardScan: () => onboardScan(),
    onboardApply: (binary: string, vault: string, agentIds: string[], dryRun?: boolean) =>
      onboardApply(binary, vault, agentIds, dryRun),
    onboardRemove: (agentIds: string[]) => onboardRemove(agentIds),
    onboardDoctor: (vault: string, binary?: string | null) =>
      onboardDoctor(vault, binary),
    onboardInit: (dir: string, force?: boolean) => onboardInit(dir, force),
    onboardGuidance: () => onboardGuidance(),
    onboardPickBinary: () => onboardPickBinary(),
    onboardResolveBinary: async () => "/bin/openobs-mcp",
  },
}));

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key;
  return `${key} ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")}`;
}) as TFunc;

beforeEach(() => {
  vi.clearAllMocks();
  flags.mock = false;
});

describe("AgentOnboardingSection", () => {
  it("扫描后渲染 agent 行,检测到的非手动 agent 默认勾选", async () => {
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-agent-cursor")).toBeInTheDocument(),
    );
    // 二进制与 vault 默认值:解析结果 + 当前打开的 vault。
    expect(
      (screen.getByTestId("settings-onboard-binary") as HTMLInputElement).value,
    ).toBe("/bin/openobs-mcp");
    expect(
      (screen.getByTestId("settings-onboard-vault") as HTMLInputElement).value,
    ).toBe("/vault");
    // claude-code 已接入徽章;cursor 未接入;grok 仅手动;zed 未检测到。
    expect(screen.getByText("settings.onboard.wired")).toBeInTheDocument();
    expect(screen.getByText("settings.onboard.notWired")).toBeInTheDocument();
    expect(screen.getByText("settings.onboard.manualOnly")).toBeInTheDocument();
    expect(screen.getByText("settings.onboard.notDetected")).toBeInTheDocument();
    // 默认勾选:present && !manual_only → claude-code + cursor(grok 手动、zed 未装不选)。
    const cursorBox = screen
      .getByTestId("settings-onboard-agent-cursor")
      .querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(cursorBox.checked).toBe(true);
    const grokBox = screen
      .getByTestId("settings-onboard-agent-grok")
      .querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(grokBox.disabled).toBe(true);
  });

  it("接入所选:提交 binary/vault/ids 并展示逐 agent 结果", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-connect")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-connect"));
    await waitFor(() => expect(onboardApply).toHaveBeenCalledTimes(1));
    const [binary, vault, ids] = onboardApply.mock.calls[0];
    expect(binary).toBe("/bin/openobs-mcp");
    expect(vault).toBe("/vault");
    expect(ids.sort()).toEqual(["claude-code", "cursor"]);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-results")).toBeInTheDocument(),
    );
    expect(screen.getByText(/\[ok\] claude-code/)).toBeInTheDocument();
    expect(screen.getByText(/\[!!\] cursor/)).toBeInTheDocument();
  });

  it("移除所选走 onboard_remove", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-disconnect")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-disconnect"));
    await waitFor(() => expect(onboardRemove).toHaveBeenCalledTimes(1));
    const [ids] = onboardRemove.mock.calls[0];
    expect(ids.sort()).toEqual(["claude-code", "cursor"]);
  });

  it("诊断展示 ok/fail 检查项", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-doctor")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-doctor"));
    await waitFor(() => expect(onboardDoctor).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-checks")).toBeInTheDocument(),
    );
    expect(screen.getByText(/vault: \/vault/)).toBeInTheDocument();
    expect(screen.getByText(/notes: no notes/)).toBeInTheDocument();
  });

  it("播种模板需确认,成功后显示写入/跳过计数", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-init")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-init"));
    await waitFor(() => expect(onboardInit).toHaveBeenCalledTimes(1));
    const [dir, force] = onboardInit.mock.calls[0];
    expect(dir).toBe("/vault");
    expect(force).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-seedmsg")).toBeInTheDocument(),
    );
    // t() 桩把插值参数拼在 key 后:written=2 skipped=1。
    expect(screen.getByTestId("settings-onboard-seedmsg").textContent).toContain(
      "settings.onboard.initDone written=2 skipped=1",
    );
    confirm.mockRestore();
  });

  it("引导文本可展开、可复制(只复制,不代写)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-guidance-toggle")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-guidance-toggle"));
    expect(screen.getByTestId("settings-onboard-guidance").textContent).toContain(
      "OpenObsidian memory",
    );
    await user.click(screen.getByTestId("settings-onboard-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("write_note");
  });

  it("浏览按钮走系统对话框回填二进制路径", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-pick")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-pick"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("settings-onboard-binary") as HTMLInputElement).value,
      ).toBe("/picked/openobs-mcp"),
    );
  });

  it("mock 模式只显示占位提示,不做任何探测", async () => {
    flags.mock = true;
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    expect(screen.getByTestId("settings-onboard-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-onboard-agent-cursor")).toBeNull();
    // 浏览器模式不触碰任何接入命令。
    expect(onboardScan).not.toHaveBeenCalled();
  });

  it("桌面模式不出现 mock 占位", async () => {
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-agent-cursor")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("settings-onboard-mock")).toBeNull();
  });
});
