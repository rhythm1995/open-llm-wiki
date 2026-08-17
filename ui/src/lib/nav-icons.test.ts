import { describe, it, expect } from "vitest";
import {
  BookOpen,
  BookmarkSimple,
  Brain,
  Calendar,
  CheckSquare,
  Code,
  Database,
  Flask,
  FolderOpen,
  IdentificationCard,
  Lightbulb,
  MagnifyingGlass,
  Note,
  Sparkle,
  Stack,
  User,
} from "@phosphor-icons/react";
import { typeIcon, typeColor } from "./nav-icons";

describe("nav-icons.typeIcon — cairn 核心类型(精确匹配)", () => {
  it("固定软类型各有独立图标", () => {
    expect(typeIcon("source")).toBe(Database);
    expect(typeIcon("summary")).toBe(Sparkle);
    expect(typeIcon("entity")).toBe(IdentificationCard);
    expect(typeIcon("concept")).toBe(Brain);
    expect(typeIcon("note")).toBe(Note);
    expect(typeIcon("query")).toBe(MagnifyingGlass);
    expect(typeIcon("type")).toBe(Stack);
    expect(typeIcon("typedoc")).toBe(BookOpen);
  });

  it("精确匹配大小写不敏感 + trim", () => {
    expect(typeIcon("Source")).toBe(Database);
    expect(typeIcon("  SUMMARY  ")).toBe(Sparkle);
    expect(typeIcon("Entity")).toBe(IdentificationCard);
    expect(typeIcon("Note")).toBe(Note);
  });

  it("cairn 类型优先于关键词规则(concept 不被 card/object 的 Cube 吃掉)", () => {
    // concept 精确命中 Brain,而非旧 RULES 里 card/object 的 Cube。
    expect(typeIcon("concept")).toBe(Brain);
    expect(typeIcon("object")).not.toBe(Brain);
  });
});

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

  it("RULES 优先级:book 在 note 子串之前(booknote 命中 BookOpen)", () => {
    expect(typeIcon("booknote")).toBe(BookOpen);
    // 纯 note(固定词表)→ 纸页,不是灯泡
    expect(typeIcon("note")).toBe(Note);
    // idea 仍走灵感灯泡
    expect(typeIcon("idea")).toBe(Lightbulb);
  });
});

describe("nav-icons.typeColor", () => {
  it("cairn 核心类型各有独立配色", () => {
    expect(typeColor("source")).toBe("text-blue");
    expect(typeColor("summary")).toBe("text-mauve");
    expect(typeColor("entity")).toBe("text-teal");
    expect(typeColor("concept")).toBe("text-yellow");
    expect(typeColor("note")).toBe("text-subtext");
    expect(typeColor("query")).toBe("text-lavender");
    expect(typeColor("type")).toBe("text-overlay");
  });

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
