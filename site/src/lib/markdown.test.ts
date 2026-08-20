import { describe, it, expect } from "vitest";
import { renderUserMarkdown } from "./markdown";

describe("renderUserMarkdown", () => {
  it("给 h2 生成 id", () => {
    const html = renderUserMarkdown("## Hello World", "en");
    expect(html).toContain('id="hello-world"');
  });

  it("仓库内链改成 /docs slug", () => {
    const html = renderUserMarkdown("[t](./tutorial.md)", "en");
    expect(html).toContain("docs/tutorial");
  });

  it("中文 md 内链带 lang=zh", () => {
    const html = renderUserMarkdown("[t](tutorial.zh.md)", "en");
    expect(html).toContain("lang=zh");
  });

  it("admonition 变成 div.admonition", () => {
    const src = "> [!NOTE]\n> keep files\n";
    const html = renderUserMarkdown(src, "en");
    expect(html).toContain('class="admonition"');
    expect(html).toContain("NOTE");
    expect(html).toContain("keep files");
  });

  it("消毒 script", () => {
    const html = renderUserMarkdown("<script>alert(1)</script>ok", "en");
    expect(html).not.toContain("<script");
    expect(html).toContain("ok");
  });
});
