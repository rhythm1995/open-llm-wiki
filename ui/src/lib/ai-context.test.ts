import { describe, expect, it } from "vitest";
import { buildAiContext } from "./ai-context";

describe("buildAiContext", () => {
  it("仅当前笔记:含标题/路径/正文,无分隔线", () => {
    const md = buildAiContext({
      current: { path: "a.md", title: "A", content: "正文 A" },
      neighbors: [],
    });
    expect(md).toContain("标题:A");
    expect(md).toContain("路径:a.md");
    expect(md).toContain("正文 A");
    expect(md).toContain("# 当前笔记");
    expect(md).not.toContain("---");
    expect(md).not.toContain("相关笔记");
  });

  it("带邻居:含每篇标题/路径/正文 + 计数", () => {
    const md = buildAiContext({
      current: { path: "a.md", title: "A", content: "正文 A" },
      neighbors: [
        { path: "b.md", title: "B", content: "正文 B" },
        { path: "c.md", title: "C", content: "正文 C" },
      ],
    });
    expect(md).toContain("共 2 篇");
    expect(md).toContain("## B");
    expect(md).toContain("路径:b.md");
    expect(md).toContain("正文 B");
    expect(md).toContain("## C");
    expect(md).toContain("正文 C");
    // 当前笔记在邻居之前
    expect(md.indexOf("# 当前笔记")).toBeLessThan(md.indexOf("## B"));
  });

  it("邻居顺序保持传入顺序", () => {
    const md = buildAiContext({
      current: { path: "x.md", title: "X", content: "x" },
      neighbors: [
        { path: "p1.md", title: "P1", content: "1" },
        { path: "p2.md", title: "P2", content: "2" },
        { path: "p3.md", title: "P3", content: "3" },
      ],
    });
    expect(md.indexOf("P1")).toBeLessThan(md.indexOf("P2"));
    expect(md.indexOf("P2")).toBeLessThan(md.indexOf("P3"));
  });

  it("正文两端空白被裁剪", () => {
    const md = buildAiContext({
      current: { path: "a.md", title: "A", content: "\n\n  body  \n\n" },
      neighbors: [],
    });
    expect(md).toContain("body");
    // trim 后不应保留前导空格的行
    expect(md).not.toMatch(/  body/);
  });

  it("frontmatter 原样保留在正文中", () => {
    const md = buildAiContext({
      current: {
        path: "a.md",
        title: "A",
        content: "---\ntype: Concept\n---\n\n# A\nbody",
      },
      neighbors: [],
    });
    expect(md).toContain("type: Concept");
  });
});
