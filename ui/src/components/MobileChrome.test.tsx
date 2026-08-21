/**
 * MobileTabBar / MobileTopBar / MobileWelcome / MobileMore(doc 18 M1)。
 * 壳组件只管布局与回调,断言:渲染三标签、回调、欢迎/更多关键交互。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileTabBar, type MobileTab } from "./MobileTabBar";
import { MobileTopBar } from "./MobileTopBar";
import { MobileWelcome } from "./MobileWelcome";
import { MobileMore } from "./MobileMore";
import type { TFunc } from "../lib/i18n";

const t = ((key: string) => key) as TFunc;

describe("MobileTabBar", () => {
  it("渲染三个标签,当前项 aria-pressed", () => {
    render(<MobileTabBar tab="notes" onSelect={() => {}} t={t} />);
    expect(screen.getByTestId("mobile-tabbar")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-tab-notes")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("mobile-tab-graph")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("mobile.tab.more")).toBeInTheDocument();
  });

  it("点标签回调 onSelect(id)", () => {
    const onSelect = vi.fn<(tab: MobileTab) => void>();
    render(<MobileTabBar tab="notes" onSelect={onSelect} t={t} />);
    fireEvent.click(screen.getByTestId("mobile-tab-graph"));
    expect(onSelect).toHaveBeenCalledWith("graph");
  });
});

describe("MobileTopBar", () => {
  it("渲染标题;菜单/搜索/新建三个回调", () => {
    const onOpenDrawer = vi.fn();
    const onOpenSearch = vi.fn();
    const onNewNote = vi.fn();
    render(
      <MobileTopBar
        title="全部笔记"
        onOpenDrawer={onOpenDrawer}
        onOpenSearch={onOpenSearch}
        onNewNote={onNewNote}
        t={t}
      />,
    );
    expect(screen.getByTestId("mobile-topbar")).toHaveTextContent("全部笔记");
    fireEvent.click(screen.getByTestId("mobile-drawer-open"));
    expect(onOpenDrawer).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "mobile.search" }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "mobile.newNote" }));
    expect(onNewNote).toHaveBeenCalledOnce();
  });
});

describe("MobileWelcome", () => {
  it("无最近 vault:只有示例库入口,无最近列表", () => {
    render(
      <MobileWelcome
        t={t}
        onCreateSample={() => {}}
        recents={[]}
        onOpenRoot={() => {}}
      />,
    );
    expect(screen.getByTestId("mobile-create-sample")).toBeInTheDocument();
    expect(screen.queryByText("mobile.welcome.recent")).not.toBeInTheDocument();
  });

  it("创建回调 + 最近列表逐项回调", () => {
    const onCreateSample = vi.fn();
    const onOpenRoot = vi.fn();
    render(
      <MobileWelcome
        t={t}
        onCreateSample={onCreateSample}
        recents={["/a/vault", "/b/vault"]}
        onOpenRoot={onOpenRoot}
      />,
    );
    fireEvent.click(screen.getByTestId("mobile-create-sample"));
    expect(onCreateSample).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("/b/vault"));
    expect(onOpenRoot).toHaveBeenCalledWith("/b/vault");
  });
});

describe("MobileMore", () => {
  it("展示 vault 名与存储类别;主题/语言/刷新回调", () => {
    const onToggleTheme = vi.fn();
    const onToggleLocale = vi.fn();
    const onRefreshIndex = vi.fn();
    render(
      <MobileMore
        t={t}
        theme="dark"
        onToggleTheme={onToggleTheme}
        onToggleLocale={onToggleLocale}
        onRefreshIndex={onRefreshIndex}
        vaultName="MyVault"
        storageKind="icloud"
      />,
    );
    expect(screen.getByText("MyVault · iCloud")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mobile-more-theme"));
    expect(onToggleTheme).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("mobile-more-locale"));
    expect(onToggleLocale).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("mobile-more-refresh"));
    expect(onRefreshIndex).toHaveBeenCalledOnce();
  });

  it("无 vault 时提示未打开", () => {
    render(
      <MobileMore
        t={t}
        theme="light"
        onToggleTheme={() => {}}
        onToggleLocale={() => {}}
        onRefreshIndex={() => {}}
        vaultName={null}
        storageKind={null}
      />,
    );
    expect(screen.getByText("mobile.more.noVault")).toBeInTheDocument();
  });
});
