import { describe, it, expect } from "vitest";
import {
  emptyHistory,
  recordNavigation,
  navigateBack,
  navigateForward,
  type NavHistory,
} from "./nav-history";

describe("recordNavigation", () => {
  it("current→next:current 入 back,forward 清空", () => {
    const h0: NavHistory = { back: ["a"], forward: ["x"] };
    const h1 = recordNavigation(h0, "b", "c");
    expect(h1).toEqual({ back: ["a", "b"], forward: [] });
  });

  it("current 为 null:back 不变,forward 清空", () => {
    const h1 = recordNavigation(emptyHistory, null, "first");
    expect(h1).toEqual({ back: [], forward: [] });
  });

  it("current===next:原样返回同一引用(不污染历史)", () => {
    const h0: NavHistory = { back: ["a"], forward: ["x"] };
    expect(recordNavigation(h0, "b", "b")).toBe(h0);
  });

  it("不修改入参(不可变)", () => {
    const h0: NavHistory = { back: ["a"], forward: [] };
    recordNavigation(h0, "a", "b");
    expect(h0.back).toEqual(["a"]);
  });
});

describe("navigateBack / navigateForward", () => {
  it("后退:弹 back 栈顶,旧 current 入 forward", () => {
    // 历史:看过 a → b,当前 c。back=[a,b],forward=[]
    let h: NavHistory = { back: ["a", "b"], forward: [] };
    const r1 = navigateBack(h, "c");
    expect(r1).toEqual([{ back: ["a"], forward: ["c"] }, "b"]);
    h = r1![0];
    const r2 = navigateBack(h, "b");
    expect(r2).toEqual([{ back: [], forward: ["c", "b"] }, "a"]);
  });

  it("前进:弹 forward 栈顶,旧 current 入 back", () => {
    const h: NavHistory = { back: [], forward: ["c", "b"] };
    expect(navigateForward(h, "a")).toEqual([{ back: ["a"], forward: ["c"] }, "b"]);
  });

  it("新分支截断 forward(回到过去后再导航)", () => {
    // 在 c 上后退到 b,再从 b 跳到 d:forward(c) 应被清空
    let h: NavHistory = emptyHistory;
    h = recordNavigation(h, null, "a"); // current null→a (无入栈)
    h = recordNavigation(h, "a", "b"); // back=[a]
    h = recordNavigation(h, "b", "c"); // back=[a,b]
    const back = navigateBack(h, "c")!; // → current=b, forward=[c]
    expect(back).toEqual([{ back: ["a"], forward: ["c"] }, "b"]);
    const branched = recordNavigation(back[0], "b", "d"); // 新分支
    expect(branched).toEqual({ back: ["a", "b"], forward: [] });
  });

  it("栈空时后退/前进返回 null", () => {
    expect(navigateBack(emptyHistory, "x")).toBeNull();
    expect(navigateForward(emptyHistory, "x")).toBeNull();
  });
});
