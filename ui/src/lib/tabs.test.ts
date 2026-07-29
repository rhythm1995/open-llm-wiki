import { describe, it, expect } from "vitest";
import { tabReduce, type TabAction, type TabState } from "./tabs";

const st = (open: string[], active: string | null): TabState => ({ open, active });

describe("tabReduce — open", () => {
  it("opens the first tab", () => {
    expect(tabReduce(st([], null), { type: "open", path: "a.md" })).toEqual(st(["a.md"], "a.md"));
  });
  it("appends a new tab and activates it", () => {
    expect(tabReduce(st(["a.md"], "a.md"), { type: "open", path: "b.md" })).toEqual(
      st(["a.md", "b.md"], "b.md"),
    );
  });
  it("activates an already-open tab without duplicating", () => {
    expect(tabReduce(st(["a.md", "b.md"], "b.md"), { type: "open", path: "a.md" })).toEqual(
      st(["a.md", "b.md"], "a.md"),
    );
  });
});

describe("tabReduce — activate", () => {
  it("activates an open tab", () => {
    expect(tabReduce(st(["a.md", "b.md"], "a.md"), { type: "activate", path: "b.md" })).toEqual(
      st(["a.md", "b.md"], "b.md"),
    );
  });
  it("ignores activate for a non-open tab", () => {
    expect(tabReduce(st(["a.md"], "a.md"), { type: "activate", path: "x.md" })).toEqual(
      st(["a.md"], "a.md"),
    );
  });
});

describe("tabReduce — close neighbor selection", () => {
  it("closing the active middle tab activates the next", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "b.md"), { type: "close", path: "b.md" }),
    ).toEqual(st(["a.md", "c.md"], "c.md"));
  });
  it("closing the active last tab activates the previous", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "c.md"), { type: "close", path: "c.md" }),
    ).toEqual(st(["a.md", "b.md"], "b.md"));
  });
  it("closing the only tab leaves nothing", () => {
    expect(tabReduce(st(["a.md"], "a.md"), { type: "close", path: "a.md" })).toEqual(
      st([], null),
    );
  });
  it("closing a non-active tab keeps active unchanged", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "a.md"), { type: "close", path: "b.md" }),
    ).toEqual(st(["a.md", "c.md"], "a.md"));
  });
  it("closing a non-open tab is a no-op", () => {
    expect(tabReduce(st(["a.md"], "a.md"), { type: "close", path: "x.md" })).toEqual(
      st(["a.md"], "a.md"),
    );
  });
});

describe("tabReduce — closeOthers / closeAll", () => {
  it("closeOthers keeps only the given tab and activates it", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "b.md"), { type: "closeOthers", path: "c.md" }),
    ).toEqual(st(["c.md"], "c.md"));
  });
  it("closeAll empties everything", () => {
    expect(tabReduce(st(["a.md", "b.md"], "a.md"), { type: "closeAll" })).toEqual(st([], null));
  });
});

describe("tabReduce — reorder", () => {
  it("moves a tab to a new index", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "b.md"), {
        type: "reorder",
        from: 0,
        to: 2,
      }),
    ).toEqual(st(["b.md", "c.md", "a.md"], "b.md"));
  });
});

describe("tabReduce — type narrowing", () => {
  it("unknown action returns state unchanged", () => {
    const s = st(["a.md"], "a.md");
    expect(tabReduce(s, { type: "noop" } as unknown as TabAction)).toEqual(s);
  });
});

describe("tabReduce — cycle", () => {
  it("forward cycles to the next tab and wraps at the end", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "c.md"), { type: "cycle", direction: 1 }),
    ).toEqual(st(["a.md", "b.md", "c.md"], "a.md"));
  });
  it("backward cycles to the previous tab and wraps at the start", () => {
    expect(
      tabReduce(st(["a.md", "b.md", "c.md"], "a.md"), { type: "cycle", direction: -1 }),
    ).toEqual(st(["a.md", "b.md", "c.md"], "c.md"));
  });
  it("no open tabs is a no-op", () => {
    expect(tabReduce(st([], null), { type: "cycle", direction: 1 })).toEqual(st([], null));
  });
  it("a single tab stays on itself", () => {
    expect(
      tabReduce(st(["a.md"], "a.md"), { type: "cycle", direction: 1 }),
    ).toEqual(st(["a.md"], "a.md"));
  });
  it("missing active falls onto the first tab", () => {
    expect(
      tabReduce(st(["a.md", "b.md"], null), { type: "cycle", direction: 1 }),
    ).toEqual(st(["a.md", "b.md"], "a.md"));
  });
});
