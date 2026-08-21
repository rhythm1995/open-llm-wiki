/**
 * WelcomeEmpty —— 无 vault 欢迎台交互。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WelcomeEmpty, displayVaultName } from "./WelcomeEmpty";
import type { TFunc } from "../lib/i18n";
import { writeRecentRoots } from "../lib/last-note";

const icloudAvailable = { current: true };

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => true,
    icloudAvailable: () => Promise.resolve(icloudAvailable.current),
  },
}));

const t = ((key: string) => key) as TFunc;

function baseProps(overrides: Partial<Parameters<typeof WelcomeEmpty>[0]>) {
  return {
    t,
    onOpenVault: vi.fn(),
    onOpenRoot: vi.fn(async () => true),
    onCreateSample: vi.fn(async () => "/sample"),
    onCreateIcloud: vi.fn(async () => "/icloud"),
    ...overrides,
  };
}

describe("displayVaultName", () => {
  it("取路径末段", () => {
    expect(displayVaultName("/Users/me/Notes")).toBe("Notes");
    expect(displayVaultName("C:\\Users\\me\\Wiki\\")).toBe("Wiki");
  });
});

describe("WelcomeEmpty", () => {
  beforeEach(() => {
    localStorage.clear();
    icloudAvailable.current = true;
  });

  it("渲染主 CTA、示例库与 iCloud 按钮", () => {
    render(<WelcomeEmpty {...baseProps({})} />);
    expect(screen.getByTestId("welcome-empty")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-mg")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-open-vault")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-create-sample")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-create-icloud")).toBeInTheDocument();
    expect(screen.getByText("welcome.title")).toBeInTheDocument();
    expect(screen.getByText("welcome.vaultExplain")).toBeInTheDocument();
  });

  it("点击打开文件夹", () => {
    const onOpenVault = vi.fn();
    render(<WelcomeEmpty {...baseProps({ onOpenVault })} />);
    fireEvent.click(screen.getByTestId("welcome-open-vault"));
    expect(onOpenVault).toHaveBeenCalled();
  });

  it("点击创建示例库", async () => {
    const onCreateSample = vi.fn(async () => "/sample");
    render(<WelcomeEmpty {...baseProps({ onCreateSample })} />);
    fireEvent.click(screen.getByTestId("welcome-create-sample"));
    await waitFor(() => expect(onCreateSample).toHaveBeenCalled());
  });

  it("点击在 iCloud 创建(doc 17)", async () => {
    const onCreateIcloud = vi.fn(async () => "/icloud/vault");
    render(<WelcomeEmpty {...baseProps({ onCreateIcloud })} />);
    fireEvent.click(screen.getByTestId("welcome-create-icloud"));
    await waitFor(() => expect(onCreateIcloud).toHaveBeenCalled());
    expect(screen.queryByTestId("welcome-error")).not.toBeInTheDocument();
  });

  it("iCloud 创建失败(未登录)显示引导本地提示", async () => {
    const onCreateIcloud = vi.fn(async () => null);
    render(<WelcomeEmpty {...baseProps({ onCreateIcloud })} />);
    fireEvent.click(screen.getByTestId("welcome-create-icloud"));
    await waitFor(() =>
      expect(screen.getByTestId("welcome-error")).toHaveTextContent(
        "welcome.icloudFailed",
      ),
    );
  });

  it("探测不可用 → iCloud 入口置灰并说明(doc 17 M2 验收)", async () => {
    icloudAvailable.current = false;
    const onCreateIcloud = vi.fn(async () => "/icloud");
    render(<WelcomeEmpty {...baseProps({ onCreateIcloud })} />);
    await waitFor(() =>
      expect(screen.getByTestId("welcome-icloud-unavailable")).toHaveTextContent(
        "welcome.icloudUnavailable",
      ),
    );
    expect(screen.getByTestId("welcome-create-icloud")).toBeDisabled();
    fireEvent.click(screen.getByTestId("welcome-create-icloud"));
    expect(onCreateIcloud).not.toHaveBeenCalled();
  });

  it("展示最近列表并可点开", async () => {
    writeRecentRoots(["/Users/me/Notes"]);
    const onOpenRoot = vi.fn(async () => true);
    render(<WelcomeEmpty {...baseProps({ onOpenRoot })} />);
    expect(screen.getByText("Notes")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Notes"));
    await waitFor(() =>
      expect(onOpenRoot).toHaveBeenCalledWith("/Users/me/Notes"),
    );
  });
});
