/**
 * ForceGraphLayer —— 把 graphData / 点击转给 force-graph。不测 Canvas 绘制。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { DEFAULT_FORCES } from "../lib/graph-layout";

type FgData = { nodes: { id: number }[]; links: unknown[] };

const instances: {
  data: FgData;
  click: ((n: { id: number }, ev: unknown) => void) | null;
}[] = [];

vi.mock("force-graph", () => ({
  default: function ForceGraph() {
    const rec: {
      data: FgData;
      click: ((n: { id: number }, ev: unknown) => void) | null;
    } = { data: { nodes: [], links: [] }, click: null };
    instances.push(rec);
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "graphData") {
            return (d?: FgData) => {
              if (d) rec.data = d;
              return d ?? rec.data;
            };
          }
          if (prop === "centerAt") {
            return (x?: number) => (x == null ? { x: 0, y: 0 } : chain);
          }
          if (prop === "zoom") {
            return (k?: number) => (k == null ? 1 : chain);
          }
          if (prop === "d3Force") {
            return (_name?: string, _force?: unknown) => {
              const force = {
                radius: () => force,
                strength: () => force,
                distance: () => force,
              };
              return force;
            };
          }
          if (prop === "onNodeClick") {
            return (fn: (n: { id: number }, ev: unknown) => void) => {
              rec.click = fn;
              return chain;
            };
          }
          return () => chain;
        },
      },
    );
    return chain;
  },
}));

vi.mock("d3-force-3d", () => ({
  forceCollide: () => {
    const force = {
      radius: () => force,
      strength: () => force,
    };
    return force;
  },
}));

import { ForceGraphLayer } from "./ForceGraphLayer";

const noop = () => {};

describe("ForceGraphLayer", () => {
  beforeEach(() => {
    instances.length = 0;
  });

  it("把节点喂给 force-graph,并把点击回传 onNodeClick", async () => {
    const onNodeClick = vi.fn();
    render(
      <ForceGraphLayer
        graphData={{
          nodes: [
            {
              id: 7,
              path: "a.md",
              title: "A",
              type: "Concept",
              degree: 1,
            },
          ],
          links: [],
        }}
        width={400}
        height={300}
        forces={DEFAULT_FORCES}
        layoutMode="force"
        cooldownTicks={10}
        forcesToken={1}
        fitToken={0}
        zoomToken={0}
        zoomFactor={1}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={noop}
        onNodeRightClick={noop}
        onNodeHover={noop}
        onBackgroundClick={noop}
        onNodeDragEnd={noop}
        onBoxSelect={noop}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(instances.length).toBeGreaterThan(0);
    const inst = instances[0];
    expect(inst.data.nodes.some((n) => n.id === 7)).toBe(true);
    inst.click?.({ id: 7 }, { preventDefault() {} });
    expect(onNodeClick).toHaveBeenCalledWith(7);
  });
});
