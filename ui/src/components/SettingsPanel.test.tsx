/**
 * SettingsPanel —— 关=不渲染;通用项 patch;tab 切换。Agent 接入已有独立测,此处 mock。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunc } from "../lib/i18n";
import { defaultAppSettings } from "../lib/settings";

const getLogStatus = vi.fn(async () => null as null | {
  dir: string;
  profile: string;
  sessionId: string;
});
const openLogDir = vi.fn(async () => {});
const setLogProfile = vi.fn(async (p: string) => p);
const exportLogBundle = vi.fn(async () => "/tmp/logs.txt");
const openProjectIssues = vi.fn();

vi.mock("./AgentOnboardingSection", () => ({
  AgentOnboardingSection: ({ vaultRoot }: { vaultRoot?: string | null }) => (
    <div data-testid="settings-agent">{vaultRoot ?? "none"}</div>
  ),
}));

vi.mock("../lib/logger", () => ({
  getLogStatus: () => getLogStatus(),
  openLogDir: () => openLogDir(),
  setLogProfile: (p: string) => setLogProfile(p),
  exportLogBundle: () => exportLogBundle(),
}));

vi.mock("../lib/project", () => ({
  openProjectIssues: () => openProjectIssues(),
}));

import { SettingsPanel } from "./SettingsPanel";

const t = ((key: string) => key) as TFunc;

describe("SettingsPanel", () => {
  const onChange = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onChange.mockClear();
    onClose.mockClear();
    getLogStatus.mockReset();
    getLogStatus.mockResolvedValue(null);
    openLogDir.mockClear();
    setLogProfile.mockClear();
    exportLogBundle.mockClear();
    openProjectIssues.mockClear();
  });

  it("open=false 不渲染", () => {
    const { container } = render(
      <SettingsPanel
        open={false}
        onClose={onClose}
        settings={defaultAppSettings()}
        onChange={onChange}
        t={t}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("主题 / 语言 / 默认模式 / 附件 / 布局 patch 给 onChange", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        open
        onClose={onClose}
        settings={defaultAppSettings()}
        onChange={onChange}
        t={t}
      />,
    );
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("settings-theme"), "dark");
    expect(onChange).toHaveBeenCalledWith({ theme: "dark" });
    await user.selectOptions(screen.getByTestId("settings-locale"), "en");
    expect(onChange).toHaveBeenCalledWith({ locale: "en" });
    await user.selectOptions(screen.getByTestId("settings-edit-mode"), "source");
    expect(onChange).toHaveBeenCalledWith({ defaultEditMode: "source" });
    fireEvent.change(screen.getByTestId("settings-attachments-dir"), {
      target: { value: "media" },
    });
    expect(onChange).toHaveBeenCalledWith({ attachmentsDir: "media" });
    await user.selectOptions(
      screen.getByTestId("settings-attachment-layout"),
      "folder",
    );
    expect(onChange).toHaveBeenCalledWith({ attachmentLayout: "folder" });
    await user.selectOptions(screen.getByTestId("settings-editor-layout"), "split");
    expect(onChange).toHaveBeenCalledWith({ editorLayout: "split" });
  });

  it("点遮罩关闭", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        open
        onClose={onClose}
        settings={defaultAppSettings()}
        onChange={onChange}
        t={t}
      />,
    );
    await user.click(screen.getByTestId("settings-panel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("initialTab=agent 打开记忆接入", () => {
    render(
      <SettingsPanel
        open
        onClose={onClose}
        settings={defaultAppSettings()}
        onChange={onChange}
        t={t}
        vaultRoot="/vault"
        initialTab="agent"
      />,
    );
    expect(screen.getByTestId("settings-agent")).toHaveTextContent("/vault");
  });

  it("诊断 tab 在 mock 下提示不可用", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        open
        onClose={onClose}
        settings={defaultAppSettings()}
        onChange={onChange}
        t={t}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "settings.tab.diagnostics" }));
    expect(screen.getByTestId("settings-diagnostics")).toHaveTextContent(
      "settings.diagnosticsMock",
    );
  });

  it("诊断有 status 时可改 profile / 打开目录 / 导出 / 报 issue", async () => {
    getLogStatus.mockResolvedValue({
      dir: "/logs",
      profile: "dev",
      sessionId: "s1",
    });
    const user = userEvent.setup();
    render(
      <SettingsPanel
        open
        onClose={onClose}
        settings={defaultAppSettings()}
        onChange={onChange}
        t={t}
        initialTab="diagnostics"
      />,
    );
    expect(await screen.findByTestId("settings-log-profile")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("settings-log-profile"), "prod");
    expect(setLogProfile).toHaveBeenCalledWith("prod");
    await user.click(screen.getByTestId("settings-open-log-dir"));
    expect(openLogDir).toHaveBeenCalled();
    await user.click(screen.getByTestId("settings-report-issue"));
    expect(openProjectIssues).toHaveBeenCalled();
    await user.click(screen.getByTestId("settings-export-logs"));
    expect(exportLogBundle).toHaveBeenCalled();
    expect(await screen.findByTestId("settings-export-path")).toHaveTextContent(
      "/tmp/logs.txt",
    );
  });
});
