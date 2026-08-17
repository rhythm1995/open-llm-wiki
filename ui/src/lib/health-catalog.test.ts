/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUTOFF_TOKEN,
  HEALTH_CATALOG,
  HEALTH_STARTER_BASENAMES,
  displayFromMarkdown,
  extractQqlFences,
  interpolateCutoff,
  isHealthLoadPath,
  matchHealthQuestion,
  normalizeQql,
  posixBasename,
  resolveCatalog,
} from "./health-catalog";

const HEALTH_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates/wiki-starter/health",
);

const TODAY = new Date(Date.UTC(2026, 7, 15)); // 2026-08-15 UTC

describe("interpolateCutoff", () => {
  it("2026-08-15 UTC − 180 天 → 2026-02-16", () => {
    expect(
      interpolateCutoff(`reviewed < "${CUTOFF_TOKEN}"`, TODAY, 180),
    ).toBe('reviewed < "2026-02-16"');
  });
});

describe("extractQqlFences", () => {
  it("抽出一个 fence", () => {
    expect(
      extractQqlFences("# T\n\n```qql\nWHERE type = \"X\"\n```\n"),
    ).toEqual(['WHERE type = "X"']);
  });

  it("抽出两个 fence(stale-sources)", () => {
    const md = readFileSync(join(HEALTH_DIR, "stale-sources.md"), "utf8");
    expect(extractQqlFences(md)).toHaveLength(2);
  });

  it("忽略 ```ts", () => {
    expect(extractQqlFences("```ts\nconst x = 1\n```\n")).toEqual([]);
  });
});

describe("normalizeQql", () => {
  it("{cutoff} ≡ starter 写死日期", () => {
    const builtin = `reviewed < "${CUTOFF_TOKEN}"`;
    expect(normalizeQql(builtin)).toBe(normalizeQql('reviewed < "2026-05-08"'));
    expect(normalizeQql(builtin)).toBe(normalizeQql('reviewed < "2026-02-06"'));
  });

  it("其它 ISO 日期 ≠ {cutoff}", () => {
    expect(normalizeQql('reviewed < "2026-07-01"')).not.toBe(
      normalizeQql(`reviewed < "${CUTOFF_TOKEN}"`),
    );
  });

  it("折叠空白", () => {
    expect(normalizeQql("WHERE  type   = \"X\"")).toBe(
      normalizeQql("WHERE type = \"X\""),
    );
  });
});

describe("starter fence lock", () => {
  it("11 个 starter 文件的 fence ≡ HEALTH_CATALOG(normalize 后)", () => {
    const files = readdirSync(HEALTH_DIR).filter((f) => f.endsWith(".md"));
    expect(files.sort()).toEqual(
      [...HEALTH_STARTER_BASENAMES].sort(),
    );
    for (const entry of HEALTH_CATALOG) {
      const md = readFileSync(
        join(HEALTH_DIR, posixBasename(entry.starterPath)),
        "utf8",
      );
      const extracted = extractQqlFences(md);
      expect(extracted.length, entry.id).toBe(entry.fences.length);
      extracted.forEach((ex, i) => {
        expect(normalizeQql(ex), `${entry.id}#${i}`).toBe(
          normalizeQql(entry.fences[i].text),
        );
      });
    }
  });
});

describe("isHealthLoadPath / posixBasename", () => {
  it("health/ 与 starter basename", () => {
    expect(isHealthLoadPath("health/orphans.md")).toBe(true);
    expect(isHealthLoadPath("orphans.md")).toBe(true);
    expect(isHealthLoadPath("notes/foo.md")).toBe(false);
    expect(posixBasename("health/orphans.md")).toBe("orphans.md");
  });
});

describe("displayFromMarkdown", () => {
  it("H1 + 其后首段", () => {
    const md = "---\ntype: Query\n---\n# Orphans\n\n**孤儿。** 没有反链。\n";
    expect(displayFromMarkdown(md)).toEqual({
      title: "Orphans",
      blurb: "**孤儿。** 没有反链。",
    });
  });
});

describe("resolveCatalog", () => {
  it("无 vault 笔记 → 11 条内置 + 插值 cutoff", () => {
    const cat = resolveCatalog([], TODAY);
    expect(cat).toHaveLength(11);
    expect(cat.every((c) => c.vaultPath === null)).toBe(true);
    const stale = cat.find((c) => c.id === "stale-agent")!;
    expect(stale.fences[0].text).toContain("2026-02-16");
    expect(stale.fences[0].text).not.toContain(CUTOFF_TOKEN);
  });

  it("onboard starter 日期不覆盖 QQL,仍用滚动 cutoff", () => {
    const md = readFileSync(join(HEALTH_DIR, "stale-agent-notes.md"), "utf8");
    const cat = resolveCatalog(
      [{ path: "health/stale-agent-notes.md", type: "Query", content: md }],
      TODAY,
    );
    const stale = cat.find((c) => c.id === "stale-agent")!;
    expect(stale.vaultPath).toBe("health/stale-agent-notes.md");
    expect(stale.displayTitle).toBeTruthy();
    expect(stale.fences[0].text).toContain("2026-02-16");
    expect(stale.fences[0].text).not.toContain("2026-05-08");
  });

  it("非 starter ISO 日期覆盖 vault 正文", () => {
    const md = `---
type: Query
metric: provenance
---
# Custom

\`\`\`qql
WHERE provenance = "agent" AND reviewed < "2026-07-01" SHOW title
\`\`\`
`;
    const cat = resolveCatalog(
      [{ path: "health/stale-agent-notes.md", type: "Query", content: md }],
      TODAY,
    );
    const stale = cat.find((c) => c.id === "stale-agent")!;
    expect(stale.fences[0].text).toContain("2026-07-01");
    expect(stale.displayTitle).toBe("Custom");
  });

  it("结构改过的 fence 覆盖", () => {
    const md = `---
type: Query
---
# Orphans

\`\`\`qql
WHERE type = "Concept" AND mentioned_in.len() = 0 SHOW title
\`\`\`
`;
    const cat = resolveCatalog(
      [{ path: "health/orphans.md", type: "Query", content: md }],
      TODAY,
    );
    const orphans = cat.find((c) => c.id === "orphans")!;
    expect(orphans.fences[0].text).toContain('type = "Concept"');
  });

  it("同 basename 先到者赢", () => {
    const first = `---
type: Query
---
# First

\`\`\`qql
WHERE type = "Entity" SHOW title
\`\`\`
`;
    const second = `---
type: Query
---
# Second

\`\`\`qql
WHERE type = "Concept" SHOW title
\`\`\`
`;
    const cat = resolveCatalog(
      [
        { path: "health/orphans.md", type: "Query", content: first },
        { path: "archive/orphans.md", type: "Query", content: second },
      ],
      TODAY,
    );
    const orphans = cat.find((c) => c.id === "orphans")!;
    expect(orphans.vaultPath).toBe("health/orphans.md");
    expect(orphans.displayTitle).toBe("First");
    expect(orphans.fences[0].text).toContain("Entity");
  });

  it("未知 Query 笔记忽略", () => {
    const cat = resolveCatalog(
      [
        {
          path: "health/custom.md",
          type: "Query",
          content: "---\ntype: Query\n---\n# X\n```qql\nWHERE 1\n```\n",
        },
      ],
      TODAY,
    );
    expect(cat.every((c) => c.vaultPath === null)).toBe(true);
  });
});

describe("matchHealthQuestion", () => {
  it("高把握关键词命中", () => {
    expect(matchHealthQuestion("库里还有哪些孤儿？")).toBe("orphans");
    expect(matchHealthQuestion("list orphans")).toBe("orphans");
    expect(matchHealthQuestion("争议概念")).toBe("contested");
    expect(matchHealthQuestion("标题撞名")).toBe("duplicates");
    expect(matchHealthQuestion("单源概念")).toBe("synthesis");
    expect(matchHealthQuestion("概念饥饿度")).toBe("hunger");
    expect(matchHealthQuestion("陈旧来源")).toBe("stale-sources");
    expect(matchHealthQuestion("agent 未复审")).toBe("provenance");
    expect(matchHealthQuestion("未复审页")).toBe("drift");
  });

  it("空或开放问题不拦", () => {
    expect(matchHealthQuestion("")).toBeNull();
    expect(matchHealthQuestion("这篇和 Alpha 的关系？")).toBeNull();
    expect(matchHealthQuestion("帮我总结今天的笔记")).toBeNull();
  });
});
