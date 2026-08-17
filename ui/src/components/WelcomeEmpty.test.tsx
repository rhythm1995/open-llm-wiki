/**
 * WelcomeEmpty —— 无 vault 欢迎台交互。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WelcomeEmpty, displayVaultName } from "./WelcomeEmpty";
import type { TFunc } from "../lib/i18n";
import { writeRecentRoots } from "../lib/last-note";

vi.mock("../lib/ipc", () => ({
  ipc: { isMock: () => true },
}));

const t = ((key: string) => key) as TFunc;

describe("displayVaultName", () => {
  it("取路径末段", () => {
    expect(displayVaultName("/Users/me/Notes")).toBe("Notes");
    expect(displayVaultName("C:\\Users\\me\\Wiki\\")).toBe("Wiki");
  });
});

describe("WelcomeEmpty", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("渲染主 CTA 与示例库按钮", () => {
    render(
      <WelcomeEmpty
        t={t}
        onOpenVault={vi.fn()}
        onOpenRoot={vi.fn(async () => true)}
        onCreateSample={vi.fn(async () => "/sample")}
      />,
    );
    expect(screen.getByTestId("welcome-empty")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-mg")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-open-vault")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-create-sample")).toBeInTheDocument();
    expect(screen.getByText("welcome.title")).toBeInTheDocument();
    expect(screen.getByText("welcome.vaultExplain")).toBeInTheDocument();
  });

  it("点击打开文件夹", () => {
    const onOpenVault = vi.fn();
    render(
      <WelcomeEmpty
        t={t}
        onOpenVault={onOpenVault}
        onOpenRoot={vi.fn(async () => true)}
        onCreateSample={vi.fn(async () => null)}
      />,
    );
    fireEvent.click(screen.getByTestId("welcome-open-vault"));
    expect(onOpenVault).toHaveBeenCalled();
  });

  it("点击创建示例库", async () => {
    const onCreateSample = vi.fn(async () => "/sample");
    render(
      <WelcomeEmpty
        t={t}
        onOpenVault={vi.fn()}
        onOpenRoot={vi.fn(async () => true)}
        onCreateSample={onCreateSample}
      />,
    );
    fireEvent.click(screen.getByTestId("welcome-create-sample"));
    await waitFor(() => expect(onCreateSample).toHaveBeenCalled());
  });

  it("展示最近列表并可点开", async () => {
    writeRecentRoots(["/Users/me/Notes"]);
    const onOpenRoot = vi.fn(async () => true);
    render(
      <WelcomeEmpty
        t={t}
        onOpenVault={vi.fn()}
        onOpenRoot={onOpenRoot}
        onCreateSample={vi.fn(async () => null)}
      />,
    );
    expect(screen.getByText("Notes")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Notes"));
    await waitFor(() =>
      expect(onOpenRoot).toHaveBeenCalledWith("/Users/me/Notes"),
    );
  });
});
