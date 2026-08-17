import { describe, expect, it } from "vitest";
import { buildVaultQueryPrompt } from "./vault-query";

describe("buildVaultQueryPrompt", () => {
  it("无问题时等待下一句,指向 run_qql / 库健康", () => {
    const p = buildVaultQueryPrompt();
    expect(p).toContain("等待用户在下一句给出问题");
    expect(p).toContain("run_qql");
    expect(p).toContain("库健康");
    expect(p).toContain("RENDER group_by");
    expect(p).not.toContain("不要假设应用内 ACP");
    expect(p).not.toContain("**Question:**");
  });

  it("有问题则写入 Question 块", () => {
    const p = buildVaultQueryPrompt("哪些概念没有反链?");
    expect(p).toContain("**Question:** `哪些概念没有反链?`");
    expect(p).not.toContain("等待用户在下一句给出问题");
    expect(p).toContain("只读");
  });
});
