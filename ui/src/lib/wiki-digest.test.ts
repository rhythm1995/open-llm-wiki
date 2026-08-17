import { describe, it, expect } from "vitest";
import {
  noteTypeFromContent,
  isSourceType,
  sourceHasInboundSummary,
  digestEligibility,
  isWikiOsPath,
  buildIngestPrompt,
  detectWikiIngestSkill,
  WIKI_INGEST_SKILL_PATHS,
  WIKI_SKILLS_NPX_CMD,
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

  it("wiki 操作系统路径即使未分类也不提炼", () => {
    const os = [
      "AGENTS.md",
      "README.md",
      "skills/wiki-ingest/SKILL.md",
      "prompts/ingest-distill.md",
      "source.md",
      "health/orphans.md",
    ];
    for (const path of os) {
      const r = digestEligibility({
        path,
        content: "# bare\n",
        nodes: [],
        edges: [],
      });
      expect(r.phase, path).toBe("hidden");
    }
  });

  it("普通未分类文章仍可提炼", () => {
    const r = digestEligibility({
      path: "2026-ai-native.md",
      content: "# 摘录\n",
      nodes: [],
      edges: [],
    });
    expect(r.phase).toBe("ready");
    expect(r.kind).toBe("untyped");
  });
});

describe("isWikiOsPath", () => {
  it("agent 约定 / skill / prompt / 根类型契约", () => {
    expect(isWikiOsPath("AGENTS.md")).toBe(true);
    expect(isWikiOsPath("CLAUDE.md")).toBe(true);
    expect(isWikiOsPath("README.md")).toBe(true);
    expect(isWikiOsPath("skills/wiki-ingest/SKILL.md")).toBe(true);
    expect(isWikiOsPath(".agents/skills/wiki-ingest/SKILL.md")).toBe(true);
    expect(isWikiOsPath("prompts/ingest-distill.md")).toBe(true);
    expect(isWikiOsPath("agents-md-tolaria-vault.md")).toBe(true);
    expect(isWikiOsPath("source.md")).toBe(true);
    expect(isWikiOsPath("index.md")).toBe(true);
    expect(isWikiOsPath("hot.md")).toBe(true);
    expect(isWikiOsPath("types/query.md")).toBe(true);
    expect(isWikiOsPath("health/orphans.md")).toBe(true);
  });

  it("知识笔记不是 OS", () => {
    expect(isWikiOsPath("2026-什么才算ai-native人才-如何unlearn.md")).toBe(false);
    expect(isWikiOsPath("concept-unlearn.md")).toBe(false);
    expect(isWikiOsPath("inbox/clip.md")).toBe(false);
    expect(isWikiOsPath("notes/index.md")).toBe(false);
    expect(isWikiOsPath("sources/source.md")).toBe(false);
  });
});

describe("buildIngestPrompt", () => {
  it("短触发:路径 + skill 名,不含 npx / 工具表", () => {
    const p = buildIngestPrompt("notes/foo.md");
    expect(p).toContain("notes/foo.md");
    expect(p).toContain("wiki-ingest");
    expect(p).not.toContain(WIKI_SKILLS_NPX_CMD);
    expect(p).not.toContain("lint_vault");
    expect(p.length).toBeLessThan(280);
  });

  it("promoteUntyped 提示未分类", () => {
    const p = buildIngestPrompt("raw.md", undefined, {
      promoteUntyped: true,
    });
    expect(p).toMatch(/无 type|未分类/);
    expect(p).toContain("Source");
  });
});

describe("detectWikiIngestSkill", () => {
  it("任一路径可读 → true", async () => {
    const ok = await detectWikiIngestSkill(async (p) => {
      if (p === WIKI_INGEST_SKILL_PATHS[0]) return "# skill\n";
      throw new Error("missing");
    });
    expect(ok).toBe(true);
  });

  it("全部失败 → false", async () => {
    const ok = await detectWikiIngestSkill(async () => {
      throw new Error("missing");
    });
    expect(ok).toBe(false);
  });
});
