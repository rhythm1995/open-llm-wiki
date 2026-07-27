import { describe, it, expect } from "vitest";

/**
 * 管线冒烟测试:确认 vitest 配置生效、ts 能跑。
 * 真实逻辑测试在各模块的 .test.ts 里(frontmatter / graph-filter / tabs)。
 */
describe("vitest pipeline", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
