import { describe, expect, it } from "vitest";
import { pinCurrentInList } from "./note-list-order";

const row = (path: string) => ({ path });

describe("pinCurrentInList", () => {
  it("首次选中记下当前位置", () => {
    const items = [row("a.md"), row("b.md"), row("c.md")];
    const { items: out, pin } = pinCurrentInList(items, "b.md", null);
    expect(out.map((n) => n.path)).toEqual(["a.md", "b.md", "c.md"]);
    expect(pin).toEqual({ path: "b.md", index: 1 });
  });

  it("仍打开时 mtime 把它排到第 0 也不挪位", () => {
    const resorted = [row("b.md"), row("a.md"), row("c.md")];
    const { items: out, pin } = pinCurrentInList(resorted, "b.md", {
      path: "b.md",
      index: 1,
    });
    expect(out.map((n) => n.path)).toEqual(["a.md", "b.md", "c.md"]);
    expect(pin).toEqual({ path: "b.md", index: 1 });
  });

  it("换一篇则按新排序钉新位置", () => {
    const items = [row("c.md"), row("a.md")];
    const { items: out, pin } = pinCurrentInList(items, "c.md", {
      path: "b.md",
      index: 1,
    });
    expect(out.map((n) => n.path)).toEqual(["c.md", "a.md"]);
    expect(pin).toEqual({ path: "c.md", index: 0 });
  });

  it("无当前笔记不钉", () => {
    const items = [row("a.md")];
    expect(pinCurrentInList(items, null, { path: "a.md", index: 0 }).pin).toBe(
      null,
    );
  });
});
