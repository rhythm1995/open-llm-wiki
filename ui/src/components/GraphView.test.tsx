/**
 * GraphView —— 图谱 chrome:空态、统计、type 过滤、布局、点节点打开笔记。
 * Canvas / 力仿真 mock 掉(ForceGraphLayer 另测接线)。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NodeOut, VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import type { TFunc } from "../lib/i18n";
import { DEFAULT_FORCES } from "../lib/graph-layout";

const captured: { onNodeClick?: (id: number) => void } = {};

vi.mock("./ForceGraphLayer", () => ({
  ForceGraphLayer: (props: {
    graphData: { nodes: { id: number }[]; links: unknown[] };
    onNodeClick: (id: number) => void;
  }) => {
    captured.onNodeClick = props.onNodeClick;
    return (
      <div
        data-testid="graph-layer"
        data-nodes={props.graphData.nodes.length}
        data-links={props.graphData.links.length}
      />
    );
  },
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => true,
    readGraphLayout: vi.fn(async () => null),
    saveGraphLayout: vi.fn(async () => {}),
  },
}));

import { GraphView } from "./GraphView";

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (!vars) return key;
  return `${key} ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")}`;
}) as TFunc;

function node(over: Partial<NodeOut>): NodeOut {
  return {
    id: 0,
    path: "",
    title: "",
    type: null,
    tags: [],
    status: null,
    created: null,
    modified: 0,
    preview: "",
    ...over,
  };
}

const snapshot: VaultSnapshot = {
  root: "/v",
  nodes: [
    node({
      id: 1,
      path: "a.md",
      title: "A",
      type: "Concept",
      modified: 10,
    }),
    node({
      id: 2,
      path: "b.md",
      title: "B",
      type: "Source",
      modified: 5,
    }),
    node({ id: 3, path: "orphan.md", title: "Orphan", type: "Note" }),
  ],
  edges: [
    {
      from: 1,
      to: 2,
      unresolved: null,
      kind: "wiki",
      relation: null,
      anchor: null,
    },
  ],
};

function mount(snap: VaultSnapshot | null = snapshot, currentId: number | null = 1) {
  const actions = { selectNote: vi.fn() } as unknown as VaultActions;
  const view = render(
    <div style={{ width: 800, height: 600 }}>
      <GraphView
        snapshot={snap}
        currentId={currentId}
        actions={actions}
        root="/v"
        forces={DEFAULT_FORCES}
        t={t}
      />
    </div>,
  );
  return { view, actions };
}

describe("GraphView", () => {
  beforeEach(() => {
    captured.onNodeClick = undefined;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      width: 800,
      height: 600,
      toJSON() {
        return {};
      },
    } as DOMRect);
  });

  it("无节点显示空态,不挂图层", () => {
    mount({ root: "/v", nodes: [], edges: [] });
    expect(screen.getByTestId("graph-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("graph-layer")).toBeNull();
  });

  it("有节点时展示统计", () => {
    mount();
    expect(screen.getByTestId("graph-view")).toBeInTheDocument();
    expect(screen.getByTestId("graph-stats").textContent).toMatch(/nodes=/);
  });

  it("点节点走 selectNote(path)", () => {
    const { actions } = mount();
    expect(captured.onNodeClick).toBeTypeOf("function");
    captured.onNodeClick?.(1);
    expect(actions.selectNote).toHaveBeenCalledWith("a.md");
  });

  it("取消 Concept 过滤后图层节点变少", async () => {
    const user = userEvent.setup();
    mount(snapshot, null);
    // 默认 scope=neighborhood 且 currentId=null 时退化为全量
    const layer = await screen.findByTestId("graph-layer");
    const before = Number(layer.getAttribute("data-nodes"));
    await user.click(screen.getByTestId("graph-filter-toggle"));
    await user.click(screen.getByTestId("graph-filter-type-Concept"));
    const after = Number(
      screen.getByTestId("graph-layer").getAttribute("data-nodes"),
    );
    expect(after).toBeLessThan(before);
  });

  it("更多面板可切到按 type 分层", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByTestId("graph-more"));
    const sel = screen.getByTestId("graph-layout");
    expect(sel).toHaveValue("force");
    fireEvent.change(sel, { target: { value: "type-layer" } });
    expect(sel).toHaveValue("type-layer");
  });

  it("范围芯片在跟随当前 / 全库之间切换", async () => {
    const user = userEvent.setup();
    mount();
    const chip = screen.getByTestId("graph-scope");
    expect(chip).toHaveTextContent("graph.chip.scopeFollow");
    await user.click(chip);
    expect(chip).toHaveTextContent("graph.chip.scopeAll");
  });
});
