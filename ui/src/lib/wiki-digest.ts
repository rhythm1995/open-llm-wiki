/**
 * wiki-digest —— 「提炼进 Wiki」产品入口的纯逻辑。
 *
 * 语义仍是 doc 14 ingest;本模块只回答:
 *  - 当前笔记是否该露出「提炼」按钮
 *  - 点按钮后预填进应用内 Agent 的固定提示词
 *
 * 可提炼候选:
 *  1. 显式 `type: Source`
 *  2. **未分类**(无 type)——收件箱里大量原料实际是源,却没标 Source
 *
 * 消化判定优先看图谱(Summary --source→ 本页),不依赖手写 Digested。
 * Concept / Summary / Entity 等已是 wiki 页 → 不露出按钮。
 */

import { parseFrontmatterEntries } from "./frontmatter";

export type DigestPhase = "hidden" | "ready" | "done";

/** 入口形态:显式来源 vs 未分类当原料。 */
export type DigestKind = "source" | "untyped";

export interface DigestEdge {
  from: number;
  to: number | null;
  kind: string;
  relation: string | null;
}

export interface DigestNode {
  id: number;
  path: string;
  type: string | null;
  title: string;
}

/** 从正文 frontmatter 读 type(快照滞后时的兜底)。 */
export function noteTypeFromContent(content: string): string | null {
  const entries = parseFrontmatterEntries(content);
  const raw = entries.find(([k]) => k === "type")?.[1];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return null;
}

export function isSourceType(type: string | null | undefined): boolean {
  return (type ?? "").trim().toLowerCase() === "source";
}

/** 无 type(收件箱 / 未分类)——可当作原料进入提炼。 */
export function isUntyped(type: string | null | undefined): boolean {
  return type == null || type.trim() === "";
}

/**
 * 是否可作为「原料」进入提炼入口。
 * Source 与未分类为 true;其它显式类型(Concept/Summary/…)为 false。
 */
export function isDigestCandidateType(type: string | null | undefined): boolean {
  return isSourceType(type) || isUntyped(type);
}

/**
 * 是否已有 Summary 经 frontmatter `source:` 关系边指回该页。
 * 边方向:Summary → 本页,kind=relation,relation=source。
 */
export function sourceHasInboundSummary(
  nodes: DigestNode[],
  edges: DigestEdge[],
  sourcePath: string,
): boolean {
  const source = nodes.find((n) => n.path === sourcePath);
  if (!source) return false;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    if (e.kind !== "relation") continue;
    if ((e.relation ?? "").toLowerCase() !== "source") continue;
    if (e.to !== source.id) continue;
    const from = byId.get(e.from);
    if (from && (from.type ?? "").toLowerCase() === "summary") return true;
  }
  return false;
}

export interface DigestEligibilityInput {
  path: string | null;
  /** 当前打开笔记正文(可含 frontmatter)。 */
  content: string;
  /** 快照 type;无则仅靠 content。 */
  snapshotType?: string | null;
  nodes: DigestNode[];
  edges: DigestEdge[];
}

/**
 * 是否展示提炼条:
 *  - hidden: 无 path / 已是 wiki 页类型(Concept 等)
 *  - ready: Source 或未分类,且尚无 Summary 挂回
 *  - done: 已有 Summary 挂回 → 可再次提炼
 */
export function digestEligibility(input: DigestEligibilityInput): {
  phase: DigestPhase;
  type: string | null;
  kind: DigestKind | null;
} {
  if (!input.path) return { phase: "hidden", type: null, kind: null };
  // 快照与正文:任一有 type 以「非空」优先;都空才算未分类。
  // snapshotType 显式 null/"" 时仍读 content(用户刚在编辑器加了 type 未 reindex)。
  const fromSnap =
    input.snapshotType != null && String(input.snapshotType).trim()
      ? String(input.snapshotType).trim()
      : null;
  const fromContent = noteTypeFromContent(input.content);
  const fromNode = input.nodes.find((n) => n.path === input.path)?.type ?? null;
  const type = fromSnap || fromContent || fromNode || null;

  if (!isDigestCandidateType(type)) {
    return { phase: "hidden", type, kind: null };
  }
  const kind: DigestKind = isSourceType(type) ? "source" : "untyped";
  const done = sourceHasInboundSummary(input.nodes, input.edges, input.path);
  return { phase: done ? "done" : "ready", type, kind };
}

/**
 * 应用内 Agent 预填的**短触发**(规程在 vault skill,不在此重复长文)。
 *
 * Skill 位置(seed / `npx open-llm-wiki-skills install`):
 *   .agents/skills/wiki-ingest/SKILL.md
 *   .claude/skills/wiki-ingest/SKILL.md
 *
 * @param opts.promoteUntyped 未分类:提醒 skill 会先标 Source
 */
export function buildIngestPrompt(
  sourcePath: string,
  _today?: string,
  opts?: { promoteUntyped?: boolean },
): string {
  const path = sourcePath.trim();
  const untyped = opts?.promoteUntyped
    ? "\n本页目前**无 type**(未分类);skill 会先标 `type: Source` 再提炼。\n"
    : "\n";
  return `请执行 vault skill **wiki-ingest**，对本笔记做 ingest / 提炼。

**Path:** \`${path}\`
${untyped}
## 要求
1. 打开并严格遵循 skill 文件(按优先级找):
   - \`.agents/skills/wiki-ingest/SKILL.md\`
   - \`.claude/skills/wiki-ingest/SKILL.md\`
   - 若缺失:用 \`prompts/ingest-distill.md\` 后备清单,并提示用户运行 \`npx open-llm-wiki-skills install .\`
2. 优先用 **open-llm-wiki** MCP 工具(\`read_note\` / \`write_note\` / \`search_notes\` / \`run_qql\` / \`lint_vault\`)。
3. 完成后列出新建/更新的路径。

不要把完整会话转录 dump 进 vault。`;
}
