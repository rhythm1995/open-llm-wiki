import { describe, expect, it } from "vitest";
import {
  assignClusterColors,
  buildClusterPalette,
  nodeClusterKey,
  topClusters,
} from "./graph-cluster";

describe("nodeClusterKey", () => {
  it("folder:取所在目录", () => {
    expect(
      nodeClusterKey({ path: "a/b/c.md", type: "Note" }, "folder"),
    ).toBe("a/b");
  });
  it("folder:根文件 → '/'", () => {
    expect(nodeClusterKey({ path: "x.md", type: "Note" }, "folder")).toBe("/");
  });
  it("folder:反斜杠规范化", () => {
    expect(
      nodeClusterKey({ path: "a\\b\\c.md", type: "Note" }, "folder"),
    ).toBe("a/b");
  });
  it("folder:尾斜杠去除", () => {
    expect(
      nodeClusterKey({ path: "a/b/c.md/", type: "Note" }, "folder"),
    ).toBe("a/b");
  });
  it("type:null → '—'", () => {
    expect(nodeClusterKey({ path: "x.md", type: null }, "type")).toBe("—");
  });
  it("type:有值 → 原样", () => {
    expect(nodeClusterKey({ path: "x.md", type: "Source" }, "type")).toBe(
      "Source",
    );
  });
  it("none → 空串", () => {
    expect(nodeClusterKey({ path: "a/b.md", type: "Note" }, "none")).toBe("");
  });
});

describe("buildClusterPalette", () => {
  it("生成指定数量的互异色相", () => {
    const pal = buildClusterPalette(5);
    expect(pal).toHaveLength(5);
    expect(new Set(pal.map((c) => c.dark)).size).toBe(5);
  });
  it("至少 1 个,size 向下夹取", () => {
    expect(buildClusterPalette(0)).toHaveLength(1);
  });
});

describe("assignClusterColors", () => {
  it("同键只分配一次,映射稳定", () => {
    const m = assignClusterColors(["a/b", "a/b", "c/d"]);
    expect(m.size).toBe(2);
    expect(m.get("a/b")).toEqual(m.get("a/b"));
  });
  it("小集合键互不撞色(≤ palette size)", () => {
    const keys = [
      "concepts",
      "entities",
      "summaries",
      "sources",
      "inbox",
      "archive",
      "drafts",
      "refs",
    ];
    const m = assignClusterColors(keys);
    const darks = new Set([...m.values()].map((c) => c.dark));
    expect(darks.size).toBe(keys.length);
  });
  it("每个 ClusterColor 回填了 key", () => {
    const m = assignClusterColors(["x", "y"]);
    expect(m.get("x")?.key).toBe("x");
    expect(m.get("y")?.key).toBe("y");
  });
});

describe("topClusters", () => {
  it("按计数降序,同计数按 key 字典序", () => {
    const counts = new Map<string, number>([
      ["a", 1],
      ["b", 3],
      ["c", 3],
    ]);
    const { entries } = topClusters(counts, 10);
    expect(entries.map((e) => e.key)).toEqual(["b", "c", "a"]);
  });
  it("超过 limit 部分进 overflow", () => {
    const counts = new Map<string, number>([
      ["a", 5],
      ["b", 3],
      ["c", 2],
    ]);
    const { entries, overflow } = topClusters(counts, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("a");
    expect(overflow).toBe(5); // b+c
  });
  it("limit=0 → 全部进 overflow", () => {
    const counts = new Map<string, number>([["a", 4]]);
    const { entries, overflow } = topClusters(counts, 0);
    expect(entries).toHaveLength(0);
    expect(overflow).toBe(4);
  });
});
