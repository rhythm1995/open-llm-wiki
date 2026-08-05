/**
 * blocknote-fidelity-sweep —— source↔WYSIWYG 往返诊断扫描(B 编辑器微体验)。
 *
 * 不是断言门禁,是**诊断报告**:把一大批 md 构造丢进真 BlockNote 引擎往返
 * (与 WysiwygView 同路径),打印每类是否被改坏 + diff 预览。
 *
 * 用法:跑 `pnpm --dir ui test blocknote-fidelity-sweep`,读控制台报告:
 *   ✅ ok        —— 规范化相等 或 关键 token 全保留
 *   ❌ BREAK      —— 往返丢了内容(token 丢失 / 输出空)
 *   ⚠  RISKY     —— 已知 BN Lossy 边界(不修,记进 DISABLED_OR_RISKY_PATTERNS)
 *
 * 发现新 BREAK → 修,并把这条例子加进 blocknote-fidelity.ts 的 SAFE_FIDELITY_FIXTURES
 * (真正断言);确认无解的 → 加进 DISABLED_OR_RISKY_PATTERNS 并在此标 RISKY。
 */
import { describe, it, expect } from "vitest";
import { evaluateEngineRoundTrip } from "./blocknote-engine-roundtrip";

interface Case {
  id: string;
  md: string;
  /** 已知 BN Lossy 边界:不要求 ok,仅记录 diff。 */
  risky?: boolean;
}

const CORPUS: Case[] = [
  { id: "headings-h1-h6", md: "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n" },
  { id: "emphasis", md: "**bold** and *italic* and ~~strike~~ and `code`\n" },
  { id: "unordered-list", md: "- a\n- b\n- c\n" },
  { id: "ordered-list", md: "1. first\n2. second\n3. third\n" },
  { id: "nested-ul-3level", md: "- a\n  - b\n    - c\n" },
  { id: "task-list", md: "- [ ] todo\n- [x] done\n" },
  { id: "nested-task-list", md: "- [ ] a\n  - [ ] b\n", risky: true },
  { id: "blockquote", md: "> quoted\n> more line\n" },
  { id: "nested-blockquote", md: "> outer\n> > inner\n" },
  { id: "code-fenced-lang", md: "```js\nconst x = 1;\n```\n" },
  { id: "code-fenced-plain", md: "```\nplain code block\n```\n" },
  // 回归:代码块里夹 wikilink。若 hydrate 误把 [[x]] 升级进 codeBlock,
  // tryParseMarkdownToBlocks→hydrate 会抛 RangeError(白屏根因)。此例必须不崩、往返保 token。
  {
    id: "code-fenced-yaml-with-wikilink",
    md: "```yaml\ntype: Note\nrelated_to: \"[[some-note]]\"\n```\n",
  },
  { id: "table-gfm", md: "| a | b |\n|---|---|\n| 1 | 2 |\n", risky: true },
  // 回归:真实笔记大量是嵌套结构。wikilink 出现在嵌套列表 / 表格单元格 / 引用里时,
  // hydrate/dehydrate 必须递归处理(否则 chip 缺失或残留)。真引擎往返必须保 token。
  { id: "wikilink-in-nested-list", md: "- a [[top]]\n  - b [[nested]]\n" },
  { id: "wikilink-in-task-nested", md: "- [ ] a [[t1]]\n  - [ ] b [[t2]]\n", risky: true },
  { id: "wikilink-in-table-cell", md: "| h1 | h2 |\n|---|---|\n| c1 | [[cell]] |\n", risky: true },
  { id: "wikilink-in-blockquote", md: "> quoted [[q]]\n" },
  { id: "codeblock-with-wikilink-in-list", md: "- item [[ok]]\n\n  ```yaml\n  x: \"[[nope]]\"\n  ```\n" },
  { id: "wikilink-plain-alias-anchor", md: "See [[Note A]] and [[B|alias]] and [[C#sec]].\n" },
  { id: "image-md-syntax", md: "![alt text](image.png)\n" },
  { id: "image-wikilink", md: "![[photo.jpg]]\n" },
  { id: "link-inline", md: "[label](https://example.com)\n" },
  { id: "horizontal-rule", md: "above\n\n---\n\nbelow\n" },
  {
    id: "mixed-realnote",
    md: "# Title\n\nSome **bold** text with [[link]] and `code`.\n\n- item one\n- item two\n\n> a quote\n\n```py\nx = 1\n```\n",
  },
  { id: "html-inline", md: "This has <strong>html</strong> inline.\n", risky: true },
  { id: "html-block", md: "<div>\nblock html\n</div>\n", risky: true },
  { id: "math-block", md: "$$\na^2 + b^2 = c^2\n$$\n" },
  { id: "footnote", md: "Text with ref[^1].\n\n[^1]: footnote content\n" },
  { id: "multi-paragraph", md: "Para one.\n\nPara two.\n\nPara three.\n" },
];

/** 单行化 md 作预览(便于表格打印)。 */
function oneline(s: string): string {
  return JSON.stringify(s).slice(0, 60);
}

describe("blocknote-fidelity-sweep —— 往返诊断报告", () => {
  it("打印全语料往返报告(诊断,不断言)", () => {
    const rows: string[] = [];
    let breaks = 0;
    let riskyBreaks = 0;
    for (const c of CORPUS) {
      const r = evaluateEngineRoundTrip(c.md, "app-pipeline");
      const tag = r.ok ? "✅ ok" : c.risky ? "⚠ RISKY" : "❌ BREAK";
      if (!r.ok && c.risky) riskyBreaks++;
      if (!r.ok && !c.risky) breaks++;
      rows.push(
        `${tag}  ${c.id.padEnd(28)} normEqual=${r.normEqual ? "Y" : "n"} ` +
          `tokensOk=${r.tokensOk ? "Y" : "n"} ` +
          `missing=[${r.missingTokens.slice(0, 3).join(",")}]`,
      );
      if (!r.ok) {
        rows.push(`         in : ${oneline(r.input)}`);
        rows.push(`         out: ${oneline(r.output)}`);
      }
    }
    // 控制台报告(诊断主体)。
    console.log("\n=== source↔WYSIWYG 往返扫描 ===\n" + rows.join("\n") +
      `\n\n汇总: BREAK=${breaks}  RISKY(已知,不断言)=${riskyBreaks}  ok=${CORPUS.length - breaks - riskyBreaks}  / 共 ${CORPUS.length}\n`);
    // 占位断言:保证测试本身绿(诊断只看报告)。
    expect(CORPUS.length).toBeGreaterThan(0);
  });
});
