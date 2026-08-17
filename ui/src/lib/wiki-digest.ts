/**
 * wiki-digest —— 「提炼进 Wiki」产品入口的纯逻辑。
 *
 * 语义仍是 doc 14 ingest;本模块只回答:
 *  - 当前笔记是否该露出「提炼」按钮
 *  - 点按钮后预填进应用内 Agent 的固定提示词
 *  - vault 是否已装 wiki-ingest skill(引导安装)
 *
 * 可提炼候选:
 *  1. 显式 `type: Source`
 *  2. **未分类**(无 type)——收件箱里大量原料实际是源,却没标 Source
 *
 * **Wiki 操作系统**(AGENTS.md / skills / prompts / 类型契约 / Health 查询…)
 * 即使未分类也不是原料,见 {@link isWikiOsPath}。
 *
 * 消化判定优先看图谱(Summary --source→ 本页),不依赖手写 Digested。
 * Concept / Summary / Entity 等已是 wiki 页 → 不露出按钮。
 */

import { parseFrontmatterEntries } from "./frontmatter";

/** vault 内 skill 探测路径(seed / npx 写入;任一存在即视为已装)。 */
export const WIKI_INGEST_SKILL_PATHS = [
  ".agents/skills/wiki-ingest/SKILL.md",
  ".claude/skills/wiki-ingest/SKILL.md",
  "skills/wiki-ingest/SKILL.md",
] as const;

/** GitHub npx 安装(无需 npm 登录)。在 Vault 根执行。 */
export const WIKI_SKILLS_NPX_CMD =
  "npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills open-llm-wiki-skills install . --hooks";

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

/** 任意目录下都算操作系统(agent 约定 / 脚手架说明书 / skill 正文)。 */
const OS_ANY_BASENAME = new Set([
  "agents.md",
  "claude.md",
  "readme.md",
  "skill.md",
]);

/** 仅 vault 根:导航、度量快照、类型契约页。子目录同名不当 OS。 */
const OS_ROOT_BASENAME = new Set([
  "index.md",
  "log.md",
  "hot.md",
  "wiki-health.md",
  "source.md",
  "summary.md",
  "concept.md",
  "entity.md",
  "note.md",
  "type.md",
]);

/** 整棵目录都是操作系统,不是原料。 */
const OS_DIR_PREFIXES = [
  "skills/",
  "prompts/",
  "health/",
  "types/",
  "tools/",
  "views/",
  ".agents/",
  ".claude/",
  ".open-llm-wiki/",
] as const;

function normVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * 是否是 wiki 操作系统文件(Schema / 工具 / 导航 / 度量),不是 ingest 原料。
 *
 * 未分类启发式会把 starter 的 AGENTS.md、README、skill、L2a prompt
 * 误标成收件箱 / 「提炼」候选;本函数把它们从这两处拿掉。
 */
export function isWikiOsPath(path: string): boolean {
  const p = normVaultPath(path);
  if (!p) return false;
  const lower = p.toLowerCase();
  const slash = lower.lastIndexOf("/");
  const base = slash === -1 ? lower : lower.slice(slash + 1);
  const dir = slash === -1 ? "" : lower.slice(0, slash + 1);

  if (OS_ANY_BASENAME.has(base)) return true;
  // kb 把 Tolaria 约定拆成 agents-md-*.md 再 @import。
  if (base.startsWith("agents-md-") && base.endsWith(".md")) return true;
  if (slash === -1 && OS_ROOT_BASENAME.has(base)) return true;
  for (const pref of OS_DIR_PREFIXES) {
    if (lower.startsWith(pref) || lower === pref.slice(0, -1)) return true;
  }
  // 点目录下任意笔记(skill 双写、配置)不当原料。
  if (dir.split("/").some((seg) => seg.startsWith("."))) return true;
  return false;
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
  if (isWikiOsPath(input.path)) {
    return { phase: "hidden", type: null, kind: null };
  }
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
  return `请执行 vault skill **wiki-ingest**。

**Path:** \`${path}\`
${untyped}不要把完整会话转录 dump 进 vault。`;
}

/**
 * 探测 vault 是否已装 wiki-ingest skill。
 * `probe(path)` 成功读到文件即 true(桌面可用 read_note;失败吞掉)。
 */
export async function detectWikiIngestSkill(
  probe: (relPath: string) => Promise<string>,
): Promise<boolean> {
  for (const p of WIKI_INGEST_SKILL_PATHS) {
    try {
      const body = await probe(p);
      if (body != null && String(body).trim().length > 0) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
