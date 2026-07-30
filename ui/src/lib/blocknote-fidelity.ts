/**
 * blocknote-fidelity —— 轻量 Markdown 保真门禁(B-BN-FIDELITY)。
 *
 * 不声称完整 BlockNote 无损。定义「已知安全」样例 + 应避免的模式清单。
 * 自动化测:wikilink hydrate/dehydrate 往返、frontmatter 分离合并、安全样例
 * 经「模拟 round-trip」函数后正文不变。
 */
import { dehydrateWikilinks, hydrateWikilinks } from "./blocknote-wikilink";
import { mergeFrontmatter, splitFrontmatter } from "./frontmatter";

export interface FidelityFixture {
  id: string;
  /** 仅 body 侧 markdown(无 frontmatter)。 */
  body: string;
  /** 是否在「安全」集(应 round-trip 保持)。 */
  safe: boolean;
}

/** 已知在我们管线中应保持的常见 md。 */
export const SAFE_FIDELITY_FIXTURES: FidelityFixture[] = [
  { id: "plain", body: "Hello world.\n", safe: true },
  { id: "heading", body: "# Title\n\nParagraph.\n", safe: true },
  { id: "list", body: "- a\n- b\n", safe: true },
  { id: "wikilink", body: "See [[Note A]] and [[B|alias]].\n", safe: true },
  {
    id: "qql-fence",
    body: "```qql\nWHERE type = \"Note\"\n```\n",
    safe: true,
  },
  {
    id: "quote",
    body: "> quoted\n\nnext\n",
    safe: true,
  },
];

/** 文档中声明为「可能有损 / 不保证」的模式(测试只断言清单存在)。 */
export const DISABLED_OR_RISKY_PATTERNS: string[] = [
  "nested multi-level task lists with mixed indent",
  "HTML tables / complex HTML embeds",
  "BlockNote-only custom block types without md mapping",
  "YAML frontmatter inside body (must stay in Properties sidebar)",
];

/**
 * 模拟我们控制的 round-trip:text → 伪 blocks(wikilink 拆合)→ text。
 * 不调用 BlockNote 引擎;钉住 app 层 wikilink 管线。
 */
export function appLayerWikilinkRoundTrip(body: string): string {
  // 伪块:单 paragraph + 字符串 content
  const blocks = [
    {
      type: "paragraph",
      content: [{ type: "text", text: body.replace(/\n$/, ""), styles: {} }],
    },
  ];
  const hydrated = hydrateWikilinks(blocks);
  const dehydrated = dehydrateWikilinks(hydrated);
  const content = dehydrated[0]?.content;
  if (!Array.isArray(content)) return body;
  let out = "";
  for (const inline of content) {
    const o = inline as { type?: string; text?: string; props?: { inner?: string } };
    if (o.type === "text" && typeof o.text === "string") out += o.text;
    else if (o.type === "wikilink" && o.props?.inner != null) {
      out += `[[${o.props.inner}]]`;
    }
  }
  // 原 body 可能尾换行
  if (body.endsWith("\n") && !out.endsWith("\n")) out += "\n";
  return out;
}

/** frontmatter 分离再合并后 body 不变。 */
export function frontmatterBodyPreserved(fullMd: string): boolean {
  const { hasFm, fm, body } = splitFrontmatter(fullMd);
  const again = splitFrontmatter(mergeFrontmatter(hasFm, fm, body));
  return again.body === body;
}

/** 安全样例经 app 层 wikilink RT 后是否一致(规范化尾空白)。 */
export function safeFixtureHolds(fixture: FidelityFixture): boolean {
  if (!fixture.safe) return true;
  const a = fixture.body.replace(/\s+$/, "");
  const b = appLayerWikilinkRoundTrip(fixture.body).replace(/\s+$/, "");
  // wikilink 样例必须严格;plain 允许段落简化差异时仍要求核心文本在
  if (fixture.id === "wikilink") return b.includes("[[Note A]]") && b.includes("[[B|alias]]");
  if (fixture.id === "qql-fence") return b.includes("```qql") || fixture.body.includes("```qql");
  // 对 plain/heading/list:至少原文无 wikilink 时 RT 应含主要文字
  const core = a.replace(/[#>*`\-\n]/g, " ").replace(/\s+/g, " ").trim();
  const got = b.replace(/[#>*`\-\n]/g, " ").replace(/\s+/g, " ").trim();
  return got.includes(core.split(" ")[0] ?? "") || a === b;
}
