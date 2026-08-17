import { describe, expect, it, vi } from "vitest";
import {
  applyHotCacheToPrompt,
  countHotWords,
  isHotOverBudget,
  shouldInjectHot,
  shouldRemindHotUpdate,
  turnsSinceHotInject,
  wrapHotCache,
  HOT_CACHE_PATH,
  HOT_WORD_BUDGET,
} from "./hot-cache";

describe("countHotWords", () => {
  it("英文按空白", () => {
    expect(countHotWords("hello world cache")).toBe(3);
  });
  it("中文一字一词", () => {
    expect(countHotWords("主张饥饿")).toBe(4);
  });
  it("中英混合", () => {
    expect(countHotWords("喂 Concept 深度")).toBe(1 + 1 + 2);
  });
});

describe("isHotOverBudget", () => {
  it("短文不超", () => {
    expect(isHotOverBudget("short")).toBe(false);
  });
  it("超预算", () => {
    expect(isHotOverBudget(Array(HOT_WORD_BUDGET + 3).fill("w").join(" "))).toBe(
      true,
    );
  });
});

describe("shouldInjectHot", () => {
  it("从未注入 → true", () => {
    expect(shouldInjectHot(null)).toBe(true);
  });
  it("刚注入过 → false;满 6 回合 → true", () => {
    expect(shouldInjectHot(0)).toBe(false);
    expect(shouldInjectHot(5)).toBe(false);
    expect(shouldInjectHot(6)).toBe(true);
  });
});

describe("wrapHotCache / remind", () => {
  it("空缓存不包", () => {
    expect(wrapHotCache("  ", "hi")).toBe("hi");
  });
  it("有正文则静默前缀", () => {
    const w = wrapHotCache("# Hot\n\nfact", "下一问");
    expect(w).toContain("fact");
    expect(w).toContain("下一问");
    expect(w).toMatch(/silently/i);
  });
  it("本轮有写且 hot 非空才提醒", () => {
    expect(shouldRemindHotUpdate(true, "# Hot\n")).toBe(true);
    expect(shouldRemindHotUpdate(false, "# Hot\n")).toBe(false);
    expect(shouldRemindHotUpdate(true, "  ")).toBe(false);
    expect(shouldRemindHotUpdate(true, null)).toBe(false);
  });
});

describe("turnsSinceHotInject", () => {
  it("从未注入 → null;否则回合差", () => {
    expect(turnsSinceHotInject(null, 3)).toBeNull();
    expect(turnsSinceHotInject(0, 6)).toBe(6);
    expect(turnsSinceHotInject(4, 5)).toBe(1);
  });
});

describe("applyHotCacheToPrompt", () => {
  it("disabled(mock)不读、不改原文", async () => {
    const readHot = vi.fn(async () => "# Hot\nfact");
    const r = await applyHotCacheToPrompt({
      enabled: false,
      userText: "hi",
      turnsSinceInject: null,
      readHot,
    });
    expect(readHot).not.toHaveBeenCalled();
    expect(r).toEqual({ text: "hi", injected: false, hotBody: null });
  });

  it("距上次注入不足 6 回合 → 不读", async () => {
    const readHot = vi.fn(async () => "# Hot");
    const r = await applyHotCacheToPrompt({
      enabled: true,
      userText: "hi",
      turnsSinceInject: 2,
      readHot,
    });
    expect(readHot).not.toHaveBeenCalled();
    expect(r.injected).toBe(false);
    expect(r.text).toBe("hi");
  });

  it("首轮读到正文 → 包进 prompt,路径约定是 hot.md", async () => {
    expect(HOT_CACHE_PATH).toBe("hot.md");
    const r = await applyHotCacheToPrompt({
      enabled: true,
      userText: "下一问",
      turnsSinceInject: null,
      readHot: async () => "# Hot\n\nfact",
    });
    expect(r.injected).toBe(true);
    expect(r.hotBody).toContain("fact");
    expect(r.text).toContain("fact");
    expect(r.text).toContain("下一问");
    expect(r.text).toMatch(/silently/i);
  });

  it("读到空白 → 不包,仍记下 body", async () => {
    const r = await applyHotCacheToPrompt({
      enabled: true,
      userText: "hi",
      turnsSinceInject: null,
      readHot: async () => "  \n",
    });
    expect(r.injected).toBe(false);
    expect(r.text).toBe("hi");
    expect(r.hotBody).toBe("  \n");
  });

  it("read 失败 → 原文,hotBody null", async () => {
    const r = await applyHotCacheToPrompt({
      enabled: true,
      userText: "hi",
      turnsSinceInject: null,
      readHot: async () => {
        throw new Error("missing");
      },
    });
    expect(r).toEqual({ text: "hi", injected: false, hotBody: null });
  });
});
