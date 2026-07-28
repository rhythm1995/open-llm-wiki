import { describe, expect, it } from "vitest";
import { parseOutline } from "./outline";

describe("parseOutline", () => {
  it("提取各级标题,保留出现顺序与行号", () => {
    const md = `# A\n\n正文\n\n## B\n\n### C\n`;
    expect(parseOutline(md)).toEqual([
      { level: 1, text: "A", line: 1 },
      { level: 2, text: "B", line: 5 },
      { level: 3, text: "C", line: 7 },
    ]);
  });
  it("忽略围栏代码块里的 # 行", () => {
    const md = ["# Title", "", "```qql", "# 这不是标题,是注释", "WHERE type = 'Concept'", "```", "", "## Real"].join("\n");
    const out = parseOutline(md);
    expect(out.map((h) => h.text)).toEqual(["Title", "Real"]);
  });
  it("交替围栏:跳出块后恢复识别", () => {
    const md = ["# A", "```", "# in-fence", "```", "# B"].join("\n");
    expect(parseOutline(md).map((h) => h.text)).toEqual(["A", "B"]);
  });
  it("行中 # 不算标题(需顶格)", () => {
    expect(parseOutline("text # not a heading")).toEqual([]);
  });
  it("裁掉标题尾部的 # 装饰", () => {
    expect(parseOutline("## Title ##")).toEqual([{ level: 2, text: "Title", line: 1 }]);
  });
  it("仅支持 1-6 级", () => {
    expect(parseOutline("####### seven hashes").length).toBe(0);
    expect(parseOutline("# one").length).toBe(1);
  });
  it("无标题返回空", () => {
    expect(parseOutline("只有正文\n没有标题")).toEqual([]);
  });
  it("层级可以不连续(无父也允许)", () => {
    const out = parseOutline("# A\n### C");
    expect(out.map((h) => h.level)).toEqual([1, 3]);
  });
});
