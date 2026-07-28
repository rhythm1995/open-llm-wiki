import { describe, expect, it } from "vitest";
import {
  TEMPLATES_DIR,
  applyTemplate,
  defaultTemplate,
  isTemplatePath,
  templateName,
} from "./template";

describe("template logic", () => {
  describe("applyTemplate", () => {
    it("替换 {{title}}", () => {
      expect(applyTemplate("# {{title}}", { title: "Foo" })).toBe("# Foo");
    });
    it("替换 {{name}}(等价于 title)", () => {
      expect(applyTemplate("# {{name}}", { title: "Foo" })).toBe("# Foo");
    });
    it("同一变量多处替换", () => {
      expect(applyTemplate("{{title}} {{title}}", { title: "X" })).toBe("X X");
    });
    it("替换 {{date}}(传入时)", () => {
      expect(
        applyTemplate("d: {{date}}", { title: "X", date: "2026-07-28" }),
      ).toBe("d: 2026-07-28");
    });
    it("date 未传入时原样保留占位符", () => {
      expect(applyTemplate("d: {{date}}", { title: "X" })).toBe("d: {{date}}");
    });
    it("容忍占位符内空白", () => {
      expect(applyTemplate("# {{ title }}", { title: "Foo" })).toBe("# Foo");
    });
    it("大小写不敏感", () => {
      expect(applyTemplate("# {{TITLE}}", { title: "Foo" })).toBe("# Foo");
    });
    it("无占位符的模板原样返回", () => {
      expect(applyTemplate("# 静态模板\n\n正文", { title: "Foo" })).toBe(
        "# 静态模板\n\n正文",
      );
    });
  });

  describe("defaultTemplate", () => {
    it("生成以标题为 H1 的空模板", () => {
      expect(defaultTemplate("Foo")).toBe("# Foo\n\n");
    });
    it("去掉路径前缀,只用末段作标题", () => {
      expect(defaultTemplate("a/b/Foo")).toBe("# Foo\n\n");
    });
  });

  describe("isTemplatePath", () => {
    it("识别 templates/ 下的路径", () => {
      expect(isTemplatePath("templates/note.md")).toBe(true);
      expect(isTemplatePath("templates/sub/x.md")).toBe(true);
    });
    it("拒绝普通笔记与近义前缀", () => {
      expect(isTemplatePath("index.md")).toBe(false);
      expect(isTemplatePath("my-templates/x.md")).toBe(false);
    });
  });

  describe("templateName", () => {
    it("templates/foo.md → foo", () => {
      expect(templateName("templates/foo.md")).toBe("foo");
    });
    it("保留子目录:templates/sub/bar.md → sub/bar", () => {
      expect(templateName("templates/sub/bar.md")).toBe("sub/bar");
    });
  });

  describe("TEMPLATES_DIR", () => {
    it("约定目录名", () => {
      expect(TEMPLATES_DIR).toBe("templates");
    });
  });
});
