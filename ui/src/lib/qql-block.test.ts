/**
 * qql-block 单测 —— 围栏块定位 + 结果渲染(纯逻辑,无需 GUI)。
 */
import { describe, it, expect } from "vitest";
import { findQqlBlocks, resultToHtml } from "./qql-block";

describe("findQqlBlocks", () => {
  it("定位单个 ```qql 块并提取查询文本", () => {
    const src = ["# T", "", "```qql", "WHERE type == Note", "SORT title", "```", "尾"].join("\n");
    const b = findQqlBlocks(src);
    expect(b).toHaveLength(1);
    expect(b[0].startLine).toBe(2);
    expect(b[0].endLine).toBe(5);
    expect(b[0].query).toBe("WHERE type == Note\nSORT title");
  });

  it("忽略非 qql 的围栏代码块", () => {
    const src = ["```ts", "const x = 1;", "```", "```qql", "WHERE status", "```"].join("\n");
    const b = findQqlBlocks(src);
    expect(b).toHaveLength(1);
    expect(b[0].query).toBe("WHERE status");
  });

  it("识别 info string 带额外文本的 qql 块(如 ```qql 标题)", () => {
    const src = ["```qql 我的查询", "WHERE x", "```"].join("\n");
    expect(findQqlBlocks(src)).toHaveLength(1);
  });

  it("不把 ```qqqq(非 qql 词)当 qql 块", () => {
    expect(findQqlBlocks("```qqqq\nx\n```")).toHaveLength(0);
  });

  it("支持多个连续 qql 块,各自独立", () => {
    const src = ["```qql", "A", "```", "```qql", "B", "```"].join("\n");
    const b = findQqlBlocks(src);
    expect(b).toHaveLength(2);
    expect(b[0].query).toBe("A");
    expect(b[1].query).toBe("B");
  });

  it("未闭合块取到文末", () => {
    const src = ["```qql", "WHERE x", "no closing"].join("\n");
    const b = findQqlBlocks(src);
    expect(b).toHaveLength(1);
    expect(b[0].query).toBe("WHERE x\nno closing");
  });

  it("闭围栏必须同字符(~~~ 不关 ```)", () => {
    const src = ["```qql", "WHERE x", "~~~", "still inside", "```"].join("\n");
    const b = findQqlBlocks(src);
    expect(b).toHaveLength(1);
    expect(b[0].query).toBe("WHERE x\n~~~\nstill inside");
  });

  it("无 qql 块返回空数组", () => {
    expect(findQqlBlocks("# 仅标题\n普通正文")).toEqual([]);
  });
});

describe("resultToHtml", () => {
  it("Count 渲染为大数字", () => {
    const h = resultToHtml({ Count: 42 });
    expect(h).toContain('qql-count');
    expect(h).toContain(">42<");
  });

  it("Sum 整数与小数", () => {
    expect(resultToHtml({ Sum: 7 })).toContain(">7<");
    expect(resultToHtml({ Sum: 7.5 })).toContain(">7.50<");
  });

  it("List 用 idToLabel 映射标题,无映射回退 #id", () => {
    const h = resultToHtml({ List: [3, 4] }, (id) => (id === 3 ? "苹果" : null));
    expect(h).toContain("qql-list");
    expect(h).toContain("苹果");
    expect(h).toContain("#4");
  });

  it("List 空显示无结果", () => {
    expect(resultToHtml({ List: [] })).toContain("无结果");
  });

  it("Groups 渲染键 + 计数徽标,空键显示(空)", () => {
    const h = resultToHtml({ Groups: [{ key: "Active", count: 3, ids: [1] }] });
    expect(h).toContain("Active");
    expect(h).toContain(">3<");
    const h2 = resultToHtml({ Groups: [{ key: "", count: 1, ids: [] }] });
    expect(h2).toContain("(空)");
  });

  it("Table 渲染表头与单元格", () => {
    const h = resultToHtml({
      Table: [{ id: 1, fields: ["a", "b"] }],
    });
    expect(h).toContain("qql-table");
    expect(h).toContain("<th>");
    expect(h).toContain(">a<");
    expect(h).toContain(">b<");
  });

  it("转义 HTML 危险字符(防注入)", () => {
    const h = resultToHtml({
      Table: [{ id: 1, fields: ["<script>x</script>"] }],
    });
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
  });

  it("转义 List 标签里的特殊字符", () => {
    const h = resultToHtml({ List: [1] }, () => `a<b>&"c"`);
    expect(h).not.toContain('<b>');
    expect(h).toContain("&lt;");
    expect(h).toContain("&quot;");
  });

  it("Groups 空显示无分组", () => {
    expect(resultToHtml({ Groups: [] })).toContain("无分组");
  });
});
