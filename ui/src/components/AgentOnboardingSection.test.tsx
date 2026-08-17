/**
 * AgentOnboardingSection 测试 —— Settings「Agent 记忆接入」面板(B-MCP-ONBOARD 桌面侧)。
 *
 * 主路径:一键接入。高级区默认折叠,路径/勾选/诊断等在「高级选项」内。
 * 覆盖:一键接入 / mock 占位 / 展开高级后 agent 行与默认勾选 / 接入所选 /
 * 拆线 / 诊断 / 播种 / 引导复制 / 浏览回填。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentOnboardingSection } from "./AgentOnboardingSection";
import type { TFunc } from "../lib/i18n";
import type { OnboardScan } from "../lib/ipc";

const scanFixture: OnboardScan = {
  home: "/home/u",
  resolved_binary: "/bin/open-llm-wiki-mcp",
  guidance: "## Open LLM Wiki memory\nuse write_note etc.",
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
      wired_command: "/bin/open-llm-wiki-mcp",
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
const onboardInstallSkill = vi.fn(async (_dir: string) => ({
  written: [".agents/skills/wiki-ingest/SKILL.md"],
  skipped: [".claude/skills/wiki-ingest/SKILL.md"],
}));
const onboardScan = vi.fn(async () => scanFixture);
const onboardGuidance = vi.fn(async () => scanFixture.guidance);
const onboardPickBinary = vi.fn(async () => "/picked/open-llm-wiki-mcp");

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
    onboardInstallSkill: (dir: string) => onboardInstallSkill(dir),
    onboardGuidance: () => onboardGuidance(),
    onboardPickBinary: () => onboardPickBinary(),
    onboardResolveBinary: async () => "/bin/open-llm-wiki-mcp",
  },
}));

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key;
  return `${key} ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")}`;
}) as TFunc;

/** 高级区默认折叠;需要路径/勾选/诊断控件时先展开。 */
async function expandAdvanced(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.getByTestId("settings-onboard-advanced-toggle")).toBeInTheDocument(),
  );
  await user.click(screen.getByTestId("settings-onboard-advanced-toggle"));
  await waitFor(() =>
    expect(screen.getByTestId("settings-onboard-binary")).toBeInTheDocument(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.mock = false;
});

describe("AgentOnboardingSection", () => {
  it("主路径展示一键接入按钮与状态摘要,不默认展开高级路径表单", async () => {
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-oneclick")).toBeInTheDocument(),
    );
    expect(screen.getByText("settings.onboard.statusOk")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-onboard-binary")).toBeNull();
    expect(screen.queryByTestId("settings-onboard-connect")).toBeNull();
    // 不出现已删除的 entryHint 键。
    expect(screen.queryByText(/settings\.onboard\.entryHint/)).toBeNull();
  });

  it("一键接入:自动播种 + 提交 binary/vault/检测到的 agent", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-oneclick")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("settings-onboard-oneclick"));
    await waitFor(() => expect(onboardInit).toHaveBeenCalledTimes(1));
    expect(onboardInit.mock.calls[0][0]).toBe("/vault");
    expect(onboardInit.mock.calls[0][1]).toBe(true);
    await waitFor(() => expect(onboardApply).toHaveBeenCalledTimes(1));
    const [binary, vault, ids] = onboardApply.mock.calls[0];
    expect(binary).toBe("/bin/open-llm-wiki-mcp");
    expect(vault).toBe("/vault");
    expect(ids.sort()).toEqual(["claude-code", "cursor"]);
    // 一键接入同时给当前工作 vault 补装 wiki-ingest skill(提炼所需)。
    await waitFor(() => expect(onboardInstallSkill).toHaveBeenCalledTimes(1));
    expect(onboardInstallSkill.mock.calls[0][0]).toBe("/vault");
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-results")).toBeInTheDocument(),
    );
    expect(screen.getByText(/\[ok\] claude-code/)).toBeInTheDocument();
    expect(screen.getByText(/\[!!\] cursor/)).toBeInTheDocument();
  });

  it("展开高级后:agent 行渲染,检测到的非手动 agent 默认勾选", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await expandAdvanced(user);
    expect(
      (screen.getByTestId("settings-onboard-binary") as HTMLInputElement).value,
    ).toBe("/bin/open-llm-wiki-mcp");
    expect(
      (screen.getByTestId("settings-onboard-vault") as HTMLInputElement).value,
    ).toBe("/vault");
    // 状态 chip 在主路径卡片列表与高级区勾选行各渲染一份 → 用 getAllByText。
    expect(screen.getAllByText("settings.onboard.wired").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("settings.onboard.notWired").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("settings.onboard.manualOnly").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("settings.onboard.notDetected").length).toBeGreaterThanOrEqual(1);
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
    await expandAdvanced(user);
    await user.click(screen.getByTestId("settings-onboard-connect"));
    await waitFor(() => expect(onboardApply).toHaveBeenCalledTimes(1));
    const [binary, vault, ids] = onboardApply.mock.calls[0];
    expect(binary).toBe("/bin/open-llm-wiki-mcp");
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
    await expandAdvanced(user);
    await user.click(screen.getByTestId("settings-onboard-disconnect"));
    await waitFor(() => expect(onboardRemove).toHaveBeenCalledTimes(1));
    const [ids] = onboardRemove.mock.calls[0];
    expect(ids.sort()).toEqual(["claude-code", "cursor"]);
  });

  it("诊断展示 ok/fail 检查项", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await expandAdvanced(user);
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
    await expandAdvanced(user);
    await user.click(screen.getByTestId("settings-onboard-init"));
    await waitFor(() => expect(onboardInit).toHaveBeenCalledTimes(1));
    const [dir, force] = onboardInit.mock.calls[0];
    expect(dir).toBe("/vault");
    expect(force).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-seedmsg")).toBeInTheDocument(),
    );
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
    await expandAdvanced(user);
    await user.click(screen.getByTestId("settings-onboard-guidance-toggle"));
    expect(screen.getByTestId("settings-onboard-guidance").textContent).toContain(
      "Open LLM Wiki memory",
    );
    await user.click(screen.getByTestId("settings-onboard-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("write_note");
  });

  it("浏览按钮走系统对话框回填二进制路径", async () => {
    const user = userEvent.setup();
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await expandAdvanced(user);
    await user.click(screen.getByTestId("settings-onboard-pick"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("settings-onboard-binary") as HTMLInputElement).value,
      ).toBe("/picked/open-llm-wiki-mcp"),
    );
  });

  it("mock 模式只显示占位提示,不做任何探测", async () => {
    flags.mock = true;
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    expect(screen.getByTestId("settings-onboard-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-onboard-oneclick")).toBeNull();
    expect(onboardScan).not.toHaveBeenCalled();
  });

  it("桌面模式不出现 mock 占位", async () => {
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-oneclick")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("settings-onboard-mock")).toBeNull();
  });

  it("主路径默认展示各 agent 记忆接入卡片列表(图标 + 状态 + 接入明细)", async () => {
    render(<AgentOnboardingSection vaultRoot="/vault" t={t} />);
    await waitFor(() =>
      expect(screen.getByTestId("settings-onboard-agentlist")).toBeInTheDocument(),
    );
    // 四个 agent 都渲染出只读卡片。
    expect(screen.getByTestId("settings-onboard-agentinfo-claude-code")).toBeInTheDocument();
    expect(screen.getByTestId("settings-onboard-agentinfo-cursor")).toBeInTheDocument();
    expect(screen.getByTestId("settings-onboard-agentinfo-grok")).toBeInTheDocument();
    expect(screen.getByTestId("settings-onboard-agentinfo-zed")).toBeInTheDocument();
    // 状态 chip:已接入 / 未接入 / 仅手动 / 未检测。
    expect(screen.getByText("settings.onboard.wired")).toBeInTheDocument();
    expect(screen.getByText("settings.onboard.notWired")).toBeInTheDocument();
    expect(screen.getByText("settings.onboard.manualOnly")).toBeInTheDocument();
    expect(screen.getByText("settings.onboard.notDetected")).toBeInTheDocument();
    // 已接入者显示接入的 vault;未接入者显示检测证据。
    expect(
      within(screen.getByTestId("settings-onboard-agentinfo-claude-code")).getByText(
        /settings\.onboard\.wiredVault.* \/vault/,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("settings-onboard-agentinfo-cursor")).getByText(
        /config exists: \/home\/u\/\.cursor\/mcp\.json/,
      ),
    ).toBeInTheDocument();
  });
});
