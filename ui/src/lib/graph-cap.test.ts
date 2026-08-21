import { describe, expect, it } from "vitest";
import { capGraphSnapshot, MOBILE_GRAPH_NODE_CAP } from "./graph-cap";
import type { VaultSnapshot } from "./ipc";

function node(id: number, path = `n${id}.md`) {
  return {
    id,
    path,
    title: path,
    type: null,
    tags: [],
    status: null,
    created: null,
    modified: 0,
    preview: "",
  };
}

function edge(from: number, to: number | null) {
  return {
    from,
    to,
    unresolved: to === null ? "dangling" : null,
    kind: "wiki" as const,
    relation: null,
    anchor: null,
  };
}

describe("capGraphSnapshot (doc 18 §10.4 移动图谱降采样)", () => {
  it("未超上限:原样返回(同引用)", () => {
    const snap: VaultSnapshot = {
      root: "/v",
      nodes: [node(0), node(1)],
      edges: [edge(0, 1)],
    };
    expect(capGraphSnapshot(snap, 100)).toBe(snap);
  });

  it("超上限:保留当前笔记 + 度数高者;边两端过滤", () => {
    // 0..5 共 6 节点,上限 3。度数:0=3,1=2,2=2,3=1,4=0,5=0;
    // 当前笔记 = n5.md(id 5,度数 0)仍必须保留。
    const snap: VaultSnapshot = {
      root: "/v",
      nodes: [node(0), node(1), node(2), node(3), node(4), node(5)],
      edges: [edge(0, 1), edge(0, 2), edge(0, 3), edge(1, 2)],
    };
    const capped = capGraphSnapshot(snap, 3, "n5.md");
    const ids = capped.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([0, 1, 5]); // 0(度3) 1(度2,平 id 序) + 当前 5
    // 边:1→2 被裁(2 不在集合);0→1 保留;0→2/0→3 被裁。
    expect(capped.edges).toEqual([edge(0, 1)]);
  });

  it("悬空边(to=null)跟随 from 保留", () => {
    const snap: VaultSnapshot = {
      root: "/v",
      nodes: [node(0), node(1), node(2)],
      edges: [edge(0, null)],
    };
    const capped = capGraphSnapshot(snap, 2);
    expect(capped.edges).toEqual([edge(0, null)]);
  });

  it("默认上限常量为正且有限", () => {
    expect(MOBILE_GRAPH_NODE_CAP).toBeGreaterThan(0);
    expect(MOBILE_GRAPH_NODE_CAP).toBeLessThan(2000);
  });
});
