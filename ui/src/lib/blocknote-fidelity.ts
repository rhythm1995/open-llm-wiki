/**
 * blocknote-fidelity —— Markdown 保真契约与样例表(B-BN-FIDELITY + B-BN-FIDELITY-DEEP)。
 *
 * ## 两层门禁(均需绿)
 * 1. **App 层**(本文件):wikilink hydrate/dehydrate 假块 + frontmatter 合并
 * 2. **引擎层**(`blocknote-engine-roundtrip.ts`):真 BlockNote
 *    parse → hydrate → dehydrate → serialize(与 WysiwygView 一致)
 *
 * ## 交付边界
 * - ✅ 安全样例表 + 双层自动化门禁
 * - ⛔ 不声称全 GFM 字节无损;嵌套多层任务列表 / HTML 表 / 无映射自定义块见风险清单
 */
import { dehydrateWikilinks, hydrateWikilinks } from "./blocknote-wikilink";
import { mergeFrontmatter, splitFrontmatter } from "./frontmatter";
import { engineSafeFixtureHolds } from "./blocknote-engine-roundtrip";

export interface FidelityFixture {
  id: string;
  /** 仅 body 侧 markdown(无 frontmatter)。 */
  body: string;
  /** 是否在「安全」集(应过双层门禁)。 */
  safe: boolean;
}

/** 已知应在我们管线中保持语义的常见 md。 */
export const SAFE_FIDELITY_FIXTURES: FidelityFixture[] = [
  { id: "plain", body: "Hello world.\n", safe: true },
  { id: "heading", body: "# Title\n\nParagraph.\n", safe: true },
  { id: "list", body: "- a\n- b\n", safe: true },
  { id: "nested-list", body: "- a\n  - a1\n- b\n", safe: true },
  { id: "wikilink", body: "See [[Note A]] and [[B|alias]].\n", safe: true },
  {
    id: "emphasis",
    body: "This is **bold** and *italic* text.\n",
    safe: true,
  },
  {
    id: "task-list",
    body: "- [ ] todo\n- [x] done\n",
    safe: true,
  },
  {
    id: "fenced-code",
    body: "```ts\nconst x = 1;\n```\n",
    safe: true,
  },
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
  {
    id: "md-image",
    body: "![alt](attachments/Note/shot.png)\n",
    safe: true,
  },
  {
    id: "wiki-image-literal",
    body: "Embed ![[attachments/Note/shot.png]] here.\n",
    safe: true,
  },
  {
    id: "horizontal-rule",
    body: "above\n\n---\n\nbelow\n",
    safe: true,
  },
];

/** 明确不保证 / 有损的模式(文档 + 测试钉住清单非空)。 */
export const DISABLED_OR_RISKY_PATTERNS: string[] = [
  "nested multi-level task lists with mixed indent",
  "HTML tables / complex HTML embeds",
  "raw inline HTML (e.g. <strong>/<em>) → markdown equivalents; content survives, byte spelling not preserved",
  "BlockNote-only custom block types without md mapping",
  "YAML frontmatter inside body (must stay in Properties sidebar)",
  "full GFM byte-identity (BN lossy may normalize list markers -/* )",
];

/**
 * App 层往返:text → 伪 blocks(wikilink 拆合)→ text。
 * 不调用 BlockNote 引擎。
 */
export function appLayerWikilinkRoundTrip(body: string): string {
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
    const o = inline as {
      type?: string;
      text?: string;
      props?: { inner?: string };
    };
    if (o.type === "text" && typeof o.text === "string") out += o.text;
    else if (o.type === "wikilink" && o.props?.inner != null) {
      out += `[[${o.props.inner}]]`;
    }
  }
  if (body.endsWith("\n") && !out.endsWith("\n")) out += "\n";
  return out;
}

/** frontmatter 分离再合并后 body 不变。 */
export function frontmatterBodyPreserved(fullMd: string): boolean {
  const { hasFm, fm, body } = splitFrontmatter(fullMd);
  const again = splitFrontmatter(mergeFrontmatter(hasFm, fm, body));
  return again.body === body;
}

/** 仅 app 层 gate(轻量,不加载 BN)。 */
export function appLayerSafeFixtureHolds(f: FidelityFixture): boolean {
  if (!f.safe || !f.body.trim()) return false;
  if (f.body.includes("[[") && f.body.includes("]]")) {
    if (/!\[\[/.test(f.body) && !/\[\[[^\]]+\]\]/.test(f.body.replace(/!\[\[[^\]]*\]\]/g, ""))) {
      // 仅 wiki 图嵌入、无笔记 wikilink:app 层不拆 ![[ 为 chip,只要求非空
      return f.body.includes("![[");
    }
    // 去掉 ![[...]] 后再抽笔记 wikilink
    const withoutWikiImg = f.body.replace(/!\[\[[^\]]*\]\]/g, "");
    const inners = [...withoutWikiImg.matchAll(/\[\[([^\]]+)\]\]/g)].map(
      (m) => m[1],
    );
    if (inners.length === 0) return f.body.length > 0;
    const rt = appLayerWikilinkRoundTrip(f.body);
    return inners.every((inner) => rt.includes(`[[${inner}]]`));
  }
  return (
    f.body.length > 0 &&
    frontmatterBodyPreserved(`---\nx: 1\n---\n${f.body}`)
  );
}

/**
 * 完整安全样例 gate = app 层 + **真引擎** app-pipeline。
 * 这是 B-BN-FIDELITY-DEEP 的收敛入口。
 */
export function safeFixtureHolds(f: FidelityFixture): boolean {
  if (!appLayerSafeFixtureHolds(f)) return false;
  return engineSafeFixtureHolds(f.body);
}
