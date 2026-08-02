/**
 * blocknote-engine-roundtrip —— 真 BlockNote 引擎 Markdown 往返门禁(B-BN-FIDELITY-DEEP)。
 *
 * ## 产品契约
 * WysiwygView 真实路径:
 *   tryParseMarkdownToBlocks → hydrateWikilinks → … → dehydrateWikilinks → blocksToMarkdownLossy
 * 本模块对该路径做**可自动化门禁**,防止 source↔WYSIWYG 静默丢链接/图/标题/代码。
 *
 * ## 不保证
 * - 全 GFM **字节级**身份(BN API 自带 Lossy:无序列表 `-`/`*` 可能互换等)
 * - 嵌套多层任务列表、HTML 表、无 md 映射的自定义块
 *
 * 门禁通过条件:规范化后相等,或(有关键 token 且全部保留)且输出非空。
 */
import { BlockNoteEditor } from "@blocknote/core";
import { dehydrateWikilinks, hydrateWikilinks } from "./blocknote-wikilink";
import { wysiwygSchema } from "../components/WysiwygWikilink";

export type EngineRoundTripMode = "raw" | "app-pipeline";

let sharedEditor: ReturnType<typeof BlockNoteEditor.create> | null = null;

/** 懒建单例编辑器(带我们的 wikilink schema)。 */
export function getFidelityEditor() {
  if (!sharedEditor) {
    sharedEditor = BlockNoteEditor.create({ schema: wysiwygSchema });
  }
  return sharedEditor;
}

export function resetFidelityEditor() {
  sharedEditor = null;
}

/**
 * 规范化后再比(吸收 BN 已知无害差异):
 * - 换行 / 尾空白 / 连续空行
 * - 无序列表标记 `-` `+` `*` 统一为 `*`
 * - 任务列表 checkbox 大小写
 */
export function normalizeMdForCompare(md: string): string {
  let s = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/\n+$/g, "\n");
  if (s && !s.endsWith("\n")) s += "\n";
  s = s.replace(/\n{3,}/g, "\n\n");
  // 任务列表先于普通列表(含 indent)
  s = s.replace(
    /^(\s*)[-+*] \[([ xX])\]/gm,
    (_m, ind: string, c: string) =>
      `${ind}* [${c.toLowerCase() === "x" ? "x" : " "}]`,
  );
  // 普通无序列表
  s = s.replace(/^(\s*)[-+*] /gm, "$1* ");
  // 水平线 --- / ___ / *** 三种写法归一为 ***(整行仅 3+ 个相同符号)
  s = s.replace(/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/gm, "$1***");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  return s;
}

/**
 * 真引擎往返。
 * - raw: 仅 BN parse→serialize
 * - app-pipeline: 对齐 WysiwygView(含 wikilink hydrate/dehydrate)
 */
export function engineMarkdownRoundTrip(
  body: string,
  mode: EngineRoundTripMode = "app-pipeline",
): string {
  const editor = getFidelityEditor();
  let blocks = editor.tryParseMarkdownToBlocks(body);
  if (mode === "app-pipeline") {
    blocks = hydrateWikilinks(blocks as never) as typeof blocks;
    blocks = dehydrateWikilinks(blocks as never) as typeof blocks;
  }
  return editor.blocksToMarkdownLossy(blocks);
}

export interface EngineRoundTripResult {
  ok: boolean;
  input: string;
  output: string;
  mode: EngineRoundTripMode;
  normEqual: boolean;
  tokensOk: boolean;
  missingTokens: string[];
}

/** 应在输出中保留的关键 token。 */
export function fidelityTokens(body: string): string[] {
  const tokens: string[] = [];
  for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    tokens.push(`[[${m[1]}]]`);
  }
  for (const m of body.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g)) {
    tokens.push(m[1]!);
  }
  for (const m of body.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    tokens.push(m[1]!.trim());
  }
  for (const m of body.matchAll(/^```(\w+)/gm)) {
    tokens.push("```" + m[1]);
  }
  // 非空正文行的实质内容(去掉列表前缀后)作弱 token,防整段被吃掉
  for (const line of body.split("\n")) {
    const t = line
      .replace(/^\s*[-+*]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^>\s?/, "")
      .trim();
    if (t.length >= 3 && !t.startsWith("```")) tokens.push(t);
  }
  return [...new Set(tokens)];
}

/**
 * 门禁:
 * - 输入非空而输出空 → 失败
 * - 规范化相等 → 通过
 * - 否则:必须有 token 且全部保留 → 通过(允许额外风格差)
 * - 无 token 且规范化不等 → 失败
 */
export function evaluateEngineRoundTrip(
  body: string,
  mode: EngineRoundTripMode = "app-pipeline",
): EngineRoundTripResult {
  const output = engineMarkdownRoundTrip(body, mode);
  const normIn = normalizeMdForCompare(body);
  const normOut = normalizeMdForCompare(output);
  const normEqual = normIn === normOut;
  const tokens = fidelityTokens(body);
  const missingTokens = tokens.filter((t) => !output.includes(t));
  const tokensOk = tokens.length > 0 && missingTokens.length === 0;
  const emptyFail = body.trim().length > 0 && output.trim().length === 0;
  const ok = !emptyFail && (normEqual || tokensOk);
  return {
    ok,
    input: body,
    output,
    mode,
    normEqual,
    tokensOk,
    missingTokens,
  };
}

/** 安全样例是否过引擎门禁(供 fidelity 聚合 gate)。 */
export function engineSafeFixtureHolds(body: string): boolean {
  return evaluateEngineRoundTrip(body, "app-pipeline").ok;
}
