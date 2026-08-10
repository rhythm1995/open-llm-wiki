import { describe, it, expect } from "vitest";
import {
  noteTypeFromContent,
  isSourceType,
  sourceHasInboundSummary,
  digestEligibility,
  buildIngestPrompt,
} from "./wiki-digest";

describe("noteTypeFromContent / isSourceType", () => {
  it("读 type: Source", () => {
    expect(noteTypeFromContent("---\ntype: Source\n---\n# T\n")).toBe("Source");
    expect(isSourceType("Source")).toBe(true);
    expect(isSourceType("source")).toBe(true);
    expect(isSourceType("Summary")).toBe(false);
  });

  it("无 frontmatter → null", () => {
    expect(noteTypeFromContent("# bare\n")).toBeNull();
  });
});

describe("sourceHasInboundSummary", () => {
  const nodes = [
    { id: 1, path: "src.md", type: "Source", title: "Src" },
    { id: 2, path: "sum.md", type: "Summary", title: "Sum" },
    { id: 3, path: "other.md", type: "Concept", title: "C" },
  ];

  it("Summary --source→ Source 命中", () => {
    const edges = [
      { from: 2, to: 1, kind: "relation", relation: "source" },
    ];
    expect(sourceHasInboundSummary(nodes, edges, "src.md")).toBe(true);
  });

  it("无边 / 错 relation → false", () => {
    expect(sourceHasInboundSummary(nodes, [], "src.md")).toBe(false);
    expect(
      sourceHasInboundSummary(
        nodes,
        [{ from: 2, to: 1, kind: "wiki", relation: null }],
        "src.md",
      ),
    ).toBe(false);
  });
});

describe("digestEligibility", () => {
  const nodes = [
    { id: 1, path: "src.md", type: "Source", title: "Src" },
    { id: 2, path: "sum.md", type: "Summary", title: "Sum" },
    { id: 3, path: "raw.md", type: null, title: "Raw" },
  ];

  it("Concept 等 wiki 页 → hidden", () => {
    const r = digestEligibility({
      path: "a.md",
      content: "---\ntype: Concept\n---\n",
      nodes: [],
      edges: [],
    });
    expect(r.phase).toBe("hidden");
    expect(r.kind).toBeNull();
  });

  it("Source 无 Summary → ready + kind source", () => {
    const r = digestEligibility({
      path: "src.md",
      content: "---\ntype: Source\nstatus: Unprocessed\n---\n",
      nodes,
      edges: [],
    });
    expect(r.phase).toBe("ready");
    expect(r.kind).toBe("source");
  });

  it("未分类无 Summary → ready + kind untyped", () => {
    const r = digestEligibility({
      path: "raw.md",
      content: "# 一篇摘录\n\n没有 type。\n",
      nodes,
      edges: [],
    });
    expect(r.phase).toBe("ready");
    expect(r.kind).toBe("untyped");
  });

  it("Source 已有 Summary → done", () => {
    const r = digestEligibility({
      path: "src.md",
      content: "---\ntype: Source\n---\n",
      nodes,
      edges: [{ from: 2, to: 1, kind: "relation", relation: "source" }],
    });
    expect(r.phase).toBe("done");
  });

  it("无 path → hidden", () => {
    expect(
      digestEligibility({ path: null, content: "", nodes: [], edges: [] }).phase,
    ).toBe("hidden");
  });
});

describe("buildIngestPrompt", () => {
  it("短触发:路径 + skill 名 + MCP", () => {
    const p = buildIngestPrompt("notes/foo.md");
    expect(p).toContain("notes/foo.md");
    expect(p).toContain("wiki-ingest");
    expect(p).toContain("open-llm-wiki");
    expect(p).toContain(".agents/skills/wiki-ingest");
    expect(p.length).toBeLessThan(900);
  });

  it("promoteUntyped 提示未分类", () => {
    const p = buildIngestPrompt("raw.md", undefined, {
      promoteUntyped: true,
    });
    expect(p).toMatch(/无 type|未分类/);
    expect(p).toContain("Source");
  });
});
