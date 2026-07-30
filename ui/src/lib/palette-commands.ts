/**
 * palette-commands —— 兼容层。
 * 实现迁至 `commands/` 注册表;本文件保持旧 API 供测试与 import。
 */
import {
  buildAppCommands,
  filterCommands,
  type AppCommand,
  type CommandDeps,
  type CommandIcon,
  type MainViewId,
} from "./commands";

export type PaletteIcon = CommandIcon;

export interface PaletteCommand {
  id: string;
  label: string;
  icon: PaletteIcon;
  shortcut?: string;
  run: () => void;
}

export type { MainViewId };

/** @deprecated 使用 CommandDeps */
export type PaletteCommandDeps = CommandDeps;

export function buildPaletteCommands(deps: CommandDeps): PaletteCommand[] {
  return buildAppCommands(deps)
    .filter((c) => c.inPalette !== false)
    .map(toPalette);
}

function toPalette(c: AppCommand): PaletteCommand {
  return {
    id: c.id,
    label: c.label,
    icon: c.icon,
    shortcut: c.shortcut,
    run: c.run,
  };
}

export function filterPaletteCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  // 适配旧类型:构造成 filterCommands 可用的最小结构
  const asApp: AppCommand[] = commands.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    shortcut: c.shortcut,
    category: "go" as const,
    run: c.run,
  }));
  return filterCommands(asApp, query).map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    shortcut: c.shortcut,
    run: c.run,
  }));
}

export function hasRefreshIndexCommand(commands: PaletteCommand[]): boolean {
  return commands.some((c) => c.id === "refresh-index");
}

export { FileText } from "@phosphor-icons/react";
