/**
 * 证明 force 自愈从命令面板可达:列表含 refresh-index,且 run 调到传入的 refreshIndex。
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

describe("buildPaletteCommands — refresh-index force heal", () => {
  it("命令列表包含 id=refresh-index", () => {
    const cmds = buildPaletteCommands({
      t,
      openPicker: () => {},
      onNewNote: () => {},
      onNewCanvas: () => {},
      onNavigate: () => {},
      refreshIndex: () => {},
    });
    expect(hasRefreshIndexCommand(cmds)).toBe(true);
    const row = cmds.find((c) => c.id === "refresh-index");
    expect(row).toBeDefined();
    expect(row!.label.length).toBeGreaterThan(0);
    // 中文文案应提到索引/刷新
    expect(row!.label).toMatch(/索引|刷新/);
  });

  it("run() 调用传入的 refreshIndex(即 store force 路径)", () => {
    const refreshIndex = vi.fn();
    const cmds = buildPaletteCommands({
      t,
      openPicker: () => {},
      onNewNote: () => {},
      onNewCanvas: () => {},
      onNavigate: () => {},
      refreshIndex,
    });
    const row = cmds.find((c) => c.id === "refresh-index")!;
    row.run();
    expect(refreshIndex).toHaveBeenCalledTimes(1);
  });

  it("filter 可按文案命中 refresh-index", () => {
    const cmds = buildPaletteCommands({
      t,
      openPicker: () => {},
      onNewNote: () => {},
      onNewCanvas: () => {},
      onNavigate: () => {},
      refreshIndex: () => {},
    });
    const hit = filterPaletteCommands(cmds, "索引");
    expect(hasRefreshIndexCommand(hit)).toBe(true);
    const miss = filterPaletteCommands(cmds, "zzzz-no-match");
    expect(hasRefreshIndexCommand(miss)).toBe(false);
  });
});
