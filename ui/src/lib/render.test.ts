import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  resolveWikiImageTarget,
  stripFrontmatter,
  wikiImageEmbedToHtml,
  wikilinkToHtml,
} from "./render";

describe("render logic", () => {
  describe("stripFrontmatter", () => {
    it("去掉 frontmatter 围栏,保留正文", () => {
      const md = "---\ntype: Note\n---\n\n# Title\n\nbody";
      expect(stripFrontmatter(md)).toBe("# Title\n\nbody");
    });
    it("无 frontmatter 时原样返回", () => {
      expect(stripFrontmatter("# Title")).toBe("# Title");
    });
  });

  describe("wikilinkToHtml", () => {
    it("把 [[Target]] 转成带 data-target 的链接", () => {
      const out = wikilinkToHtml("看 [[Foo]] 这儿");
      expect(out).toContain('<a class="wikilink" data-target="Foo">Foo</a>');
      expect(out).toContain("看 ");
      expect(out).toContain(" 这儿");
    });
    it("使用显式别名作显示文本", () => {
      const out = wikilinkToHtml("[[Foo|Bar]]");
      expect(out).toContain('data-target="Foo"');
      expect(out).toContain(">Bar</a>");
    });
    it("target 去掉锚点;display 默认含锚点", () => {
      const out = wikilinkToHtml("[[Foo#Section]]");
      expect(out).toContain('data-target="Foo"');
    });
    it("别名优先于锚点显示", () => {
      const out = wikilinkToHtml("[[Foo#sec|Display]]");
      expect(out).toContain('data-target="Foo"');
      expect(out).toContain(">Display</a>");
    });
    it("多个 wikilink 全部转换", () => {
      const out = wikilinkToHtml("[[A]] and [[B|bb]]");
      expect(out).toContain('data-target="A"');
      expect(out).toContain('data-target="B"');
    });
    it("不动普通文本与普通链接", () => {
      const out = wikilinkToHtml("plain text [normal](http://x)");
      expect(out).toBe("plain text [normal](http://x)");
    });
  });

  describe("wikiImageEmbed / resolve", () => {
    it("![[img]] 转 img,且不破坏后续 wikilink", () => {
      const mid = wikiImageEmbedToHtml("pic ![[a/b.png|cap]] and [[Note]]");
      expect(mid).toContain('class="wiki-embed-img"');
      expect(mid).toContain('src="a/b.png"');
      expect(mid).toContain('alt="cap"');
      expect(mid).toContain("[[Note]]");
      const html = renderMarkdown("![[a/b.png]]\n\n[[Note]]");
      expect(html).toContain("wiki-embed-img");
      expect(html).toContain('data-target="Note"');
      // 不应出现 ! 后的错误 <a
      expect(html).not.toMatch(/!<a class="wikilink"/);
    });
    it("短名唯一时 resolve", () => {
      expect(
        resolveWikiImageTarget("shot.png", [
          "attachments/Daily/shot.png",
          "other/y.png",
        ]),
      ).toBe("attachments/Daily/shot.png");
    });
    it("![[Note]] 无图扩展名 → 降级 wikilink", () => {
      const html = renderMarkdown("![[Daily]]");
      expect(html).toContain('data-target="Daily"');
      expect(html).not.toContain("wiki-embed-img");
    });
  });

  describe("renderMarkdown", () => {
    it("渲染标题为 h1,wikilink 保留为可点击链接", () => {
      const html = renderMarkdown("# Title\n\nsee [[Foo]]\n");
      expect(html).toContain("<h1>Title</h1>");
      expect(html).toContain('data-target="Foo"');
    });
    it("frontmatter 不出现在渲染结果", () => {
      const html = renderMarkdown("---\ntype: Note\n---\n\n# Hi");
      expect(html).not.toContain("type: Note");
      expect(html).toContain("<h1>Hi</h1>");
    });
  });
});
