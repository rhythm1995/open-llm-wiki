/**
 * 命令面板:兼容 API + 注册表行为。
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildPaletteCommands,
  filterPaletteCommands,
  hasRefreshIndexCommand,
} from "./palette-commands";
import { translate } from "./i18n";

const t = (key: string, vars?: Record<string, string | number>) =>
  translate("zh", key, vars);

function baseDeps(
  over: Partial<Parameters<typeof buildPaletteCommands>[0]> = {},
) {
  return {
    t,
    openPicker: () => {},
    onNewNote: () => {},
    onNewCanvas: () => {},
    onNavigate: () => {},
    refreshIndex: () => {},
    ...over,
  };
}

describe("buildPaletteCommands — refresh-index force heal", () => {
  it("命令列表包含 id=refresh-index", () => {
    const cmds = buildPaletteCommands(baseDeps());
    expect(hasRefreshIndexCommand(cmds)).toBe(true);
    const row = cmds.find((c) => c.id === "refresh-index");
    expect(row!.label).toMatch(/索引|刷新/);
  });

  it("run() 调用传入的 refreshIndex", () => {
    const refreshIndex = vi.fn();
    const cmds = buildPaletteCommands(baseDeps({ refreshIndex }));
    cmds.find((c) => c.id === "refresh-index")!.run();
    expect(refreshIndex).toHaveBeenCalledTimes(1);
  });

  it("filter 可按文案命中 refresh-index", () => {
    const cmds = buildPaletteCommands(baseDeps());
    expect(hasRefreshIndexCommand(filterPaletteCommands(cmds, "索引"))).toBe(
      true,
    );
    expect(
      hasRefreshIndexCommand(filterPaletteCommands(cmds, "zzzz-no-match")),
    ).toBe(false);
  });
});

describe("buildPaletteCommands — expand", () => {
  it("open-vault 为 ⌘O;含 save / find / find-vault", () => {
    const saveNow = vi.fn();
    const openFind = vi.fn();
    const openVaultSearch = vi.fn();
    const setEditMode = vi.fn();
    const cmds = buildPaletteCommands(
      baseDeps({
        saveNow,
        openFind,
        openVaultSearch,
        setEditMode,
        hasCurrentNote: true,
        archiveCurrent: () => {},
        revealCurrent: () => {},
        canReveal: true,
        toggleTheme: () => {},
        theme: "dark",
        toggleLocale: () => {},
      }),
    );
    expect(cmds.find((c) => c.id === "open-vault")?.shortcut).toBe("⌘O");
    expect(cmds.find((c) => c.id === "save")?.shortcut).toBe("⌘S");
    cmds.find((c) => c.id === "save")!.run();
    expect(saveNow).toHaveBeenCalled();
    cmds.find((c) => c.id === "find")!.run();
    expect(openFind).toHaveBeenCalled();
    cmds.find((c) => c.id === "find-vault")!.run();
    expect(openVaultSearch).toHaveBeenCalled();
    cmds.find((c) => c.id === "mode-source")!.run();
    expect(setEditMode).toHaveBeenCalledWith("source");
    expect(cmds.some((c) => c.id === "archive")).toBe(true);
    expect(cmds.some((c) => c.id === "reveal")).toBe(true);
  });

  it("含 settings 入口", () => {
    const openSettings = vi.fn();
    const cmds = buildPaletteCommands(baseDeps({ openSettings }));
    const row = cmds.find((c) => c.id === "settings");
    expect(row).toBeDefined();
    row!.run();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
