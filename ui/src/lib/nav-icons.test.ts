import { describe, it, expect } from "vitest";
import {
  BookOpen,
  BookmarkSimple,
  Calendar,
  CheckSquare,
  Code,
  Flask,
  FolderOpen,
  Lightbulb,
  User,
} from "@phosphor-icons/react";
import { typeIcon, typeColor } from "./nav-icons";

describe("nav-icons.typeIcon", () => {
  it("命中关键词返回对应图标", () => {
    expect(typeIcon("book")).toBe(BookOpen);
    expect(typeIcon("person")).toBe(User);
    expect(typeIcon("project")).toBe(FolderOpen);
    expect(typeIcon("task")).toBe(CheckSquare);
    expect(typeIcon("idea")).toBe(Lightbulb);
    expect(typeIcon("meeting")).toBe(Calendar);
    expect(typeIcon("code snippet")).toBe(Code);
    expect(typeIcon("research lab")).toBe(Flask);
  });

  it("大小写不敏感", () => {
    expect(typeIcon("BOOK")).toBe(BookOpen);
    expect(typeIcon("Meeting")).toBe(Calendar);
    expect(typeIcon("  Project  ")).toBe(FolderOpen);
  });

  it("关键词作为子串命中(如 my-book-notes)", () => {
    expect(typeIcon("my-book-notes")).toBe(BookOpen);
    expect(typeIcon("weekly-meeting-2024")).toBe(Calendar);
  });

  it("未命中任何关键词 → 回退 BookmarkSimple", () => {
    expect(typeIcon("zzz-unknown-type")).toBe(BookmarkSimple);
    expect(typeIcon("")).toBe(BookmarkSimple);
  });

  it("RULES 优先级:book 在 note 之前(book-notes 命中 BookOpen 而非 Lightbulb)", () => {
    // "note" 单独命中 Lightbulb,但 "book" 规则更靠前,"booknote" 应被 book 命中。
    expect(typeIcon("booknote")).toBe(BookOpen);
    // 纯 note(无 book)→ Lightbulb
    expect(typeIcon("note")).toBe(Lightbulb);
  });
});

describe("nav-icons.typeColor", () => {
  it("命中关键词返回对应 Tailwind 色类", () => {
    expect(typeColor("book")).toBe("text-lavender");
    expect(typeColor("person")).toBe("text-teal");
    expect(typeColor("project")).toBe("text-blue");
    expect(typeColor("task")).toBe("text-green");
    expect(typeColor("idea")).toBe("text-yellow");
  });

  it("未命中 → 回退 text-subtext", () => {
    expect(typeColor("zzz-unknown")).toBe("text-subtext");
    expect(typeColor("")).toBe("text-subtext");
  });

  it("同 type 的 icon 与 color 同源命中同一规则", () => {
    // person → User 图标 + text-teal 色,二者来自同一条 RULE,一致性可测。
    expect(typeIcon("person")).toBe(User);
    expect(typeColor("person")).toBe("text-teal");
  });
});
