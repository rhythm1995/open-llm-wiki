// @vitest-environment jsdom
//
// sanitize() 需要 DOMPurify,而 DOMPurify 需要 window;故本文件单独用 jsdom 环境。
// render.ts 的其余纯逻辑(renderMarkdown / wikilinkToHtml / stripFrontmatter)在
// node 环境测(render.test.ts),不依赖 DOM。
import { describe, expect, it } from "vitest";
import { renderMarkdown, sanitize } from "./render";

describe("sanitize (DOMPurify)", () => {
  it("剥离 <script>", () => {
    const html = renderMarkdown("# Hi\n\n<script>alert(1)</script>\n");
    const out = sanitize(html);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    // 正常内容仍保留
    expect(out).toContain("<h1>Hi</h1>");
  });

  it("剥离内联事件处理器(onerror/onclick)", () => {
    const md = '<img src="x.png" onerror="alert(1)" alt="pic">';
    const out = sanitize(renderMarkdown(md));
    expect(out).not.toContain("onerror");
    expect(out.toLowerCase()).not.toMatch(/on\w+\s*=/);
  });

  it("剥离 javascript: 链接", () => {
    const md = "[bad](javascript:alert(1))";
    const out = sanitize(renderMarkdown(md));
    expect(out).not.toContain("javascript:");
  });

  it("保留 wikilink 的 data-target 与 class(点击委托依赖)", () => {
    const out = sanitize(renderMarkdown("see [[Foo]]\n"));
    expect(out).toContain('data-target="Foo"');
    expect(out).toContain('class="wikilink"');
    // 锚点 + 别名场景也保留
    const out2 = sanitize(renderMarkdown("[[Foo#sec|Display]]\n"));
    expect(out2).toContain('data-target="Foo"');
    expect(out2).toContain(">Display</a>");
  });

  it("保留正常 markdown 元素(标题/列表/代码/表格)", () => {
    const md = "# Title\n\n- a\n- b\n\n`code`\n\n| h |\n|---|\n| 1 |";
    const out = sanitize(renderMarkdown(md));
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<li>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<table>");
  });
});
