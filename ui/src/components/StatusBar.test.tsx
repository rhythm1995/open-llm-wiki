/**
 * StatusBar 组件测试 —— 验证 vi.mock ipc pattern(组件直接 import ipc)。
 *
 * StatusBar 读取 ipc.isMock() 决定是否显示 mock 徽标。整条 ipc 用 vi.mock 替换。
 * 覆盖:四种保存态文案、节点计数、mock 徽标。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar";
import type { VaultState } from "../lib/store";
import type { Theme } from "../lib/theme";
import type { Locale, TFunc } from "../lib/i18n";

vi.mock("../lib/ipc", () => ({
  ipc: { isMock: () => true },
}));

const t = ((key: string, params?: Record<string, string | number>) => {
  if (!params) return key;
  return `${key} ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(" ")}`;
}) as TFunc;

function state(over: Partial<VaultState> = {}): VaultState {
  return {
    saveState: "idle",
    dirty: false,
    currentPath: null,
    content: "",
    snapshot: null,
    ...over,
  } as unknown as VaultState;
}

const base = {
  state: state({}),
  theme: "dark" as Theme,
  onToggleTheme: vi.fn(),
  locale: "zh" as Locale,
  onToggleLocale: vi.fn(),
  t,
};

describe("StatusBar", () => {
  it("saving 态显示保存中文案", () => {
    render(<StatusBar {...base} state={state({ saveState: "saving" })} />);
    expect(screen.getByText(/status\.saving/)).toBeInTheDocument();
  });

  it("saved 态显示已保存文案", () => {
    render(<StatusBar {...base} state={state({ saveState: "saved" })} />);
    expect(screen.getByText(/status\.saved/)).toBeInTheDocument();
  });

  it("dirty 显示未保存文案", () => {
    render(<StatusBar {...base} state={state({ dirty: true })} />);
    expect(screen.getByText("status.dirty")).toBeInTheDocument();
  });

  it("idle 显示空闲文案", () => {
    render(<StatusBar {...base} state={state({})} />);
    expect(screen.getByText("status.idle")).toBeInTheDocument();
  });

  it("显示快照节点计数", () => {
    render(
      <StatusBar
        {...base}
        state={state({ snapshot: { nodes: [{}, {}, {}] } as unknown as VaultState["snapshot"] })}
      />,
    );
    expect(screen.getByText(/status\.notes/)).toHaveTextContent("n=3");
  });

  it("mock 模式显示徽标", () => {
    render(<StatusBar {...base} />);
    expect(screen.getByText("status.mock")).toBeInTheDocument();
  });
});
