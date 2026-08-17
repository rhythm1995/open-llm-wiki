import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { HealthView } from "./HealthView";
import type { TFunc } from "../lib/i18n";
import type { ResultSet, VaultSnapshot } from "../lib/ipc";

const runQql = vi.fn(async (): Promise<ResultSet> => ({ List: [] }));

vi.mock("../lib/ipc", () => ({
  ipc: {
    isMock: () => true,
    runQql: (...args: unknown[]) => runQql(...(args as [])),
  },
}));

const t = ((key: string) => key) as TFunc;

const snapshot: VaultSnapshot = {
  root: "/vault",
  nodes: [
    {
      id: 0,
      path: "a.md",
      title: "Alpha",
      type: "Concept",
      tags: [],
      status: null,
      created: null,
      modified: 0,
      preview: "",
    },
    {
      id: 1,
      path: "b.md",
      title: "Beta",
      type: "Concept",
      tags: [],
      status: null,
      created: null,
      modified: 0,
      preview: "",
    },
  ],
  edges: [],
};

function censusSnap(): VaultSnapshot {
  return {
    root: "/vault",
    nodes: [
      {
        id: 0,
        path: "fed.md",
        title: "Fed",
        type: "Concept",
        tags: [],
        status: "Active",
        created: null,
        modified: 0,
        preview: "",
      },
      {
        id: 1,
        path: "thin.md",
        title: "Thin",
        type: "Concept",
        tags: [],
        status: "Active",
        created: null,
        modified: 0,
        preview: "",
      },
      {
        id: 2,
        path: "src.md",
        title: "Src",
        type: "Source",
        tags: [],
        status: "Digested",
        created: null,
        modified: 0,
        preview: "",
      },
    ],
    edges: [
      { from: 2, to: 0, unresolved: null, kind: "wiki", relation: null, anchor: null },
      { from: 2, to: 0, unresolved: null, kind: "relation", relation: "source", anchor: null },
    ],
  };
}

describe("HealthView", () => {
  beforeEach(() => {
    runQql.mockReset();
    runQql.mockResolvedValue({ List: [] });
  });

  it("画出 11 块 + mock 提示 + 总览分数", () => {
    render(
      <HealthView
        root="/vault"
        snapshot={censusSnap()}
        queryNotes={[]}
        t={t}
        onOpenNote={() => {}}
        onAskAgent={() => {}}
      />,
    );
    expect(screen.getByTestId("health-view")).toBeInTheDocument();
    expect(screen.getByText("health.mockHint")).toBeInTheDocument();
    expect(screen.getByTestId("health-scorecard")).toBeInTheDocument();
    expect(screen.getByTestId("health-overview")).toBeInTheDocument();
    expect(screen.getByTestId("health-overview-pane")).toBeInTheDocument();
    expect(screen.getByTestId("health-frontier")).toBeInTheDocument();
    expect(screen.getByTestId("health-metric-orphans")).toBeInTheDocument();
    expect(screen.getByTestId("health-metric-duplicates")).toBeInTheDocument();
    expect(screen.getAllByTestId(/health-metric-/)).toHaveLength(11);
    // mock 不扫 QQL;图谱角标即时:Thin 入度 0 → 饥饿/单源/孤儿
    expect(screen.getByTestId("health-card-orphans")).toHaveTextContent("1");
    expect(screen.getByTestId("health-card-single")).toHaveTextContent("1");
    expect(runQql).not.toHaveBeenCalled();
    expect(screen.getByTestId("health-next-action")).toHaveTextContent(
      "health.next.orphans",
    );
    expect(screen.getByText("Thin")).toBeTruthy();
  });

  it("点分数卡打开对应指标", async () => {
    render(
      <HealthView
        root="/vault"
        snapshot={censusSnap()}
        queryNotes={[]}
        t={t}
        onOpenNote={() => {}}
        onAskAgent={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("health-card-orphans"));
    await waitFor(() => expect(runQql).toHaveBeenCalled());
    expect(screen.queryByTestId("health-overview-pane")).toBeNull();
  });

  it("点瓷砖走 runQql;空 List 显示 empty", async () => {
    render(
      <HealthView
        root="/vault"
        snapshot={snapshot}
        queryNotes={[]}
        t={t}
        onOpenNote={() => {}}
        onAskAgent={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("health-metric-orphans"));
    await waitFor(() => expect(runQql).toHaveBeenCalled());
    expect(await screen.findByText("health.empty")).toBeInTheDocument();
  });

  it("groups 低计数行 dim,不删除(stub ResultSet)", async () => {
    runQql.mockResolvedValue({
      Groups: [
        { key: "dup", count: 2, ids: [0, 1] },
        { key: "solo", count: 1, ids: [0] },
      ],
    });
    render(
      <HealthView
        root="/vault"
        snapshot={snapshot}
        queryNotes={[]}
        t={t}
        onOpenNote={() => {}}
        onAskAgent={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("health-metric-duplicates"));
    expect(await screen.findByText("dup")).toBeInTheDocument();
    expect(screen.getByText("solo")).toBeInTheDocument();
    const solo = screen.getByText("solo").closest("li");
    expect(solo?.className).toMatch(/opacity-40/);
  });

  it("总览前沿折叠:点开可见出超入的主张,点击打开笔记", () => {
    const now = Date.now();
    const snap: VaultSnapshot = {
      root: "/vault",
      nodes: [
        {
          id: 0,
          path: "hub.md",
          title: "FrontierHub",
          type: "Concept",
          tags: [],
          status: "Active",
          created: null,
          modified: now,
          preview: "",
        },
        {
          id: 1,
          path: "leaf.md",
          title: "Leaf",
          type: "Concept",
          tags: [],
          status: "Active",
          created: null,
          modified: now,
          preview: "",
        },
      ],
      edges: [
        {
          from: 0,
          to: 1,
          unresolved: null,
          kind: "wiki",
          relation: null,
          anchor: null,
        },
      ],
    };
    const onOpenNote = vi.fn();
    render(
      <HealthView
        root="/vault"
        snapshot={snap}
        queryNotes={[]}
        t={t}
        onOpenNote={onOpenNote}
        onAskAgent={() => {}}
      />,
    );
    const box = screen.getByTestId("health-frontier");
    expect(box).not.toHaveAttribute("open");
    fireEvent.click(within(box).getByText("health.frontier"));
    fireEvent.click(within(box).getByText("FrontierHub"));
    expect(onOpenNote).toHaveBeenCalledWith("hub.md");
  });

  it("问 Agent 提交调用 onAskAgent", () => {
    const onAskAgent = vi.fn();
    render(
      <HealthView
        root="/vault"
        snapshot={snapshot}
        queryNotes={[]}
        t={t}
        onOpenNote={() => {}}
        onAskAgent={onAskAgent}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("health.askAgentPlaceholder"), {
      target: { value: "孤儿概念" },
    });
    fireEvent.click(screen.getByText("health.askAgent"));
    expect(onAskAgent).toHaveBeenCalledWith("孤儿概念");
  });
});
