import { describe, it, expect } from "vitest";
import {
  QUERY_TYPE,
  sanitizeQueryName,
  queryNotePath,
  buildQueryNote,
  extractQueryFromNote,
  isQueryNode,
  defaultQueryName,
} from "./saved-query";
import { splitFrontmatter } from "./frontmatter";

describe("sanitizeQueryName", () => {
  it("替换各 OS 非法字符为连字符", () => {
    expect(sanitizeQueryName("a/b\\c:d")).toBe("a-b-c-d");
  });
  it("折叠多余空白", () => {
    expect(sanitizeQueryName("  a   b  ")).toBe("a b");
  });
  it("空名回退为 query", () => {
    expect(sanitizeQueryName("")).toBe("query");
    expect(sanitizeQueryName("   ")).toBe("query");
    expect(sanitizeQueryName("///")).toBe("query");
  });
});

describe("queryNotePath", () => {
  it("统一目录前缀 + .md", () => {
    expect(queryNotePath("活跃概念")).toBe("queries/活跃概念.md");
    expect(queryNotePath("a/b")).toBe("queries/a-b.md");
  });
});

describe("buildQueryNote / extractQueryFromNote round-trip", () => {
  const qql = 'WHERE type = "Concept" SORT mentioned_in.len() DESC SHOW title';

  it("build 产出 type: Query 软类型 + sanitized 名作 H1", () => {
    const note = buildQueryNote("活跃 概念", qql);
    const { hasFm, fm } = splitFrontmatter(note);
    expect(hasFm).toBe(true);
    expect(fm).toContain("type: Query");
    expect(note).toContain("# 活跃 概念");
  });

  it("extract 能从 build 的笔记抠回 qql(去首尾空白)", () => {
    const note = buildQueryNote("x", `  ${qql}  `);
    expect(extractQueryFromNote(note)).toBe(qql);
  });

  it("多行 qql 也能 round-trip(仅去整体首尾空白)", () => {
    const multi = "WHERE type = \"Concept\"\nSORT title ASC\nSHOW title, status";
    const note = buildQueryNote("m", multi);
    expect(extractQueryFromNote(note)).toBe(multi);
  });
});

describe("extractQueryFromNote", () => {
  it("无 qql 块 → null", () => {
    expect(extractQueryFromNote("# plain\n\nhello\n")).toBeNull();
    expect(extractQueryFromNote("")).toBeNull();
  });
  it("有 ```qql 块 → 返回去空白后的内文", () => {
    const content = "intro\n\n```qql\nWHERE x\nSHOW y\n```\n\ntail";
    expect(extractQueryFromNote(content)).toBe("WHERE x\nSHOW y");
  });
  it("其它语言的代码块不算", () => {
    const content = "```js\nconst x = 1\n```";
    expect(extractQueryFromNote(content)).toBeNull();
  });
});

describe("isQueryNode", () => {
  const mk = (type: string | null) => ({ id: 1, path: "p", title: "t", type, tags: [], status: null, created: null, modified: 0, preview: "" });
  it('type === "Query" → true', () => {
    expect(isQueryNode(mk(QUERY_TYPE))).toBe(true);
  });
  it("其它类型 / null → false", () => {
    expect(isQueryNode(mk("Concept"))).toBe(false);
    expect(isQueryNode(mk(null))).toBe(false);
  });
});

describe("defaultQueryName", () => {
  it("去前导关键字,取头几个词", () => {
    expect(defaultQueryName('WHERE type = "Concept" SORT x')).toBe('type = "Concept"');
  });
  it("RENDER 开头也剥", () => {
    expect(defaultQueryName("RENDER count WHERE x")).toBe("count WHERE x");
  });
  it("空 → query", () => {
    expect(defaultQueryName("")).toBe("query");
    expect(defaultQueryName("  ")).toBe("query");
  });
});
