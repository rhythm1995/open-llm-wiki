/**
 * health-catalog —— 库健康 11 条锁定 QQL(纯逻辑,无 IO)。
 *
 * QQL 是 IR,人不当 DSL 学。本模块只做:内置目录、vault 笔记按 basename 覆盖、
 * `{cutoff}` 滚动日期、与 starter `.md` 的结构比对。求值走 Tauri `run_qql`。
 *
 * 改 `wiki_health_qql.rs` 里的 QQL 字符串时,必须同步改 `HEALTH_CATALOG`。
 */

import { parseFrontmatterEntries, splitFrontmatter } from "./frontmatter";

export type HealthMetricId =
  | "contested"
  | "orphans"
  | "hunger"
  | "evidence"
  | "synthesis"
  | "provenance"
  | "stale-agent"
  | "drift"
  | "mix"
  | "stale-sources"
  | "duplicates";

export type HealthRenderHint = "list" | "table" | "groups" | "count";

export interface HealthFence {
  text: string;
  columns: string[];
}

export interface HealthCatalogEntry {
  id: HealthMetricId;
  /** starter frontmatter `metric:`(仅文档;覆盖键是 basename)。 */
  metric: string;
  starterPath: string;
  titleKey: string;
  blurbKey: string;
  fences: HealthFence[];
  cutoffDays?: number;
  render: HealthRenderHint;
  minCount?: number;
}

export interface HealthQueryNote {
  path: string;
  type: string | null;
  content: string;
}

export interface ResolvedHealthItem {
  id: HealthMetricId;
  metric: string;
  starterPath: string;
  titleKey: string;
  blurbKey: string;
  render: HealthRenderHint;
  minCount?: number;
  cutoffDays?: number;
  vaultPath: string | null;
  displayTitle: string | null;
  displayBlurb: string | null;
  fences: HealthFence[];
}

export const HEALTH_CUTOFF_DAYS = 180;
export const CUTOFF_TOKEN = "{cutoff}";
/** 仅这些 starter 写死日期 ≡ `{cutoff}`。其它 ISO 日期算作者改过查询。 */
export const STARTER_CUTOFF_DATES = ["2026-05-08", "2026-02-06"] as const;

const CUTOFF_SENTINEL = "\u0000CUTOFF\u0000";

export const HEALTH_CATALOG: readonly HealthCatalogEntry[] = [
  {
    id: "contested",
    metric: "contested",
    starterPath: "health/contested-concepts.md",
    titleKey: "health.metric.contested",
    blurbKey: "health.metric.contested.blurb",
    render: "table",
    fences: [
      {
        text: `WHERE type = "Concept" AND status = "Contested" SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "orphans",
    metric: "orphans",
    starterPath: "health/orphans.md",
    titleKey: "health.metric.orphans",
    blurbKey: "health.metric.orphans.blurb",
    render: "table",
    fences: [
      {
        text: `WHERE type IN ("Entity", "Concept") AND mentioned_in.len() = 0 SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "hunger",
    metric: "hunger",
    starterPath: "health/concept-hunger.md",
    titleKey: "health.metric.hunger",
    blurbKey: "health.metric.hunger.blurb",
    render: "table",
    fences: [
      {
        text: `WHERE type = "Concept" SHOW title, mentioned_in.len() AS depth SORT mentioned_in.len() ASC`,
        columns: ["title", "depth"],
      },
    ],
  },
  {
    id: "evidence",
    metric: "evidence",
    starterPath: "health/evidence-distribution.md",
    titleKey: "health.metric.evidence",
    blurbKey: "health.metric.evidence.blurb",
    render: "groups",
    fences: [
      {
        text: `WHERE type = "Source" RENDER group_by(evidence_tier)`,
        columns: [],
      },
    ],
  },
  {
    id: "synthesis",
    metric: "synthesis",
    starterPath: "health/single-source-concepts.md",
    titleKey: "health.metric.synthesis",
    blurbKey: "health.metric.synthesis.blurb",
    render: "table",
    fences: [
      {
        text: `WHERE type = "Concept" AND mentioned_in.len() < 2 SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "provenance",
    metric: "provenance",
    starterPath: "health/agent-unreviewed.md",
    titleKey: "health.metric.provenance",
    blurbKey: "health.metric.provenance.blurb",
    render: "table",
    fences: [
      {
        text: `WHERE provenance = "agent" AND NOT has reviewed SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "stale-agent",
    metric: "provenance",
    starterPath: "health/stale-agent-notes.md",
    titleKey: "health.metric.stale-agent",
    blurbKey: "health.metric.stale-agent.blurb",
    render: "table",
    cutoffDays: HEALTH_CUTOFF_DAYS,
    fences: [
      {
        text: `WHERE provenance = "agent" AND (NOT has reviewed OR reviewed < "{cutoff}") SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "drift",
    metric: "drift",
    starterPath: "health/unreviewed-pages.md",
    titleKey: "health.metric.drift",
    blurbKey: "health.metric.drift.blurb",
    render: "table",
    fences: [
      {
        text: `WHERE type IN ("Concept", "Entity", "Summary") AND NOT has reviewed SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "mix",
    metric: "provenance",
    starterPath: "health/knowledge-mix.md",
    titleKey: "health.metric.mix",
    blurbKey: "health.metric.mix.blurb",
    render: "groups",
    fences: [
      {
        text: `WHERE type IN ("Concept", "Entity", "Summary") RENDER group_by(provenance)`,
        columns: [],
      },
    ],
  },
  {
    id: "stale-sources",
    metric: "drift",
    starterPath: "health/stale-sources.md",
    titleKey: "health.metric.stale-sources",
    blurbKey: "health.metric.stale-sources.blurb",
    render: "table",
    cutoffDays: HEALTH_CUTOFF_DAYS,
    fences: [
      {
        text: `WHERE type = "Source" AND last_verified < "{cutoff}" SORT last_verified ASC SHOW title, last_verified`,
        columns: ["title", "last_verified"],
      },
      {
        text: `WHERE type = "Source" AND NOT has last_verified SHOW title`,
        columns: ["title"],
      },
    ],
  },
  {
    id: "duplicates",
    metric: "duplicates",
    starterPath: "health/duplicate-titles.md",
    titleKey: "health.metric.duplicates",
    blurbKey: "health.metric.duplicates.blurb",
    render: "groups",
    minCount: 2,
    fences: [
      {
        text: `WHERE type IN ("Concept", "Entity") RENDER group_by(title)`,
        columns: [],
      },
    ],
  },
];

export const HEALTH_STARTER_BASENAMES: ReadonlySet<string> = new Set(
  HEALTH_CATALOG.map((e) => posixBasename(e.starterPath)),
);

export function posixBasename(path: string): string {
  const posix = path.replace(/\\/g, "/");
  const i = posix.lastIndexOf("/");
  return i < 0 ? posix : posix.slice(i + 1);
}

/**
 * 高把握问句 → 库健康指标。对不上返回 null(仍走 Agent)。
 * 更具体的短语先匹配,避免「未复审」吞掉「agent 未复审」。
 */
export function matchHealthQuestion(q: string): HealthMetricId | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const rules: Array<{ id: HealthMetricId; keys: string[] }> = [
    { id: "provenance", keys: ["agent 未复审", "unreviewed agent", "agent-unreviewed"] },
    { id: "stale-sources", keys: ["陈旧来源", "stale source", "stale-sources"] },
    { id: "stale-agent", keys: ["复审超期", "stale agent"] },
    { id: "synthesis", keys: ["单源主张", "单源概念", "单源", "single-source"] },
    { id: "hunger", keys: ["饥饿度", "主张饥饿", "概念饥饿", "hunger"] },
    { id: "duplicates", keys: ["撞名", "duplicate"] },
    { id: "contested", keys: ["争议", "contested"] },
    { id: "orphans", keys: ["孤儿", "orphan"] },
    { id: "drift", keys: ["未复审", "unreviewed"] },
  ];
  for (const r of rules) {
    if (r.keys.some((k) => s.includes(k.toLowerCase()))) return r.id;
  }
  return null;
}

/** App 读 Query 笔记的上限:health/ 或 11 个 starter basename。 */
export function isHealthLoadPath(path: string): boolean {
  const posix = path.replace(/\\/g, "/");
  if (posix === "health" || posix.startsWith("health/")) return true;
  return HEALTH_STARTER_BASENAMES.has(posixBasename(posix));
}

export function interpolateCutoff(
  qql: string,
  today: Date = new Date(),
  days: number = HEALTH_CUTOFF_DAYS,
): string {
  const utc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const cut = new Date(utc - days * 86_400_000).toISOString().slice(0, 10);
  return qql.split(CUTOFF_TOKEN).join(cut);
}

/**
 * 结构比对:折叠空白;把 `{cutoff}` / `"{cutoff}"` / starter 写死日期打成同一哨兵。
 * 其它 `"YYYY-MM-DD"` 原样保留,所以 `"2026-07-01"` ≠ 内置。
 */
export function normalizeQql(qql: string): string {
  let s = qql.trim().replace(/\s+/g, " ");
  s = s.split(`"${CUTOFF_TOKEN}"`).join(CUTOFF_SENTINEL);
  s = s.split(CUTOFF_TOKEN).join(CUTOFF_SENTINEL);
  for (const d of STARTER_CUTOFF_DATES) {
    s = s.split(`"${d}"`).join(CUTOFF_SENTINEL);
  }
  return s;
}

export function extractQqlFences(markdown: string): string[] {
  const out: string[] = [];
  const re = /```qql[ \t]*\r?\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const body = m[1].trim();
    if (body) out.push(body);
  }
  return out;
}

function noteIsQuery(note: HealthQueryNote): boolean {
  if ((note.type ?? "").trim().toLowerCase() === "query") return true;
  const raw = parseFrontmatterEntries(note.content).find(
    ([k]) => k === "type",
  )?.[1];
  const t =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && typeof raw[0] === "string"
        ? raw[0]
        : "";
  return t.trim().toLowerCase() === "query";
}

export function displayFromMarkdown(markdown: string): {
  title: string | null;
  blurb: string | null;
} {
  const { body } = splitFrontmatter(markdown);
  let title: string | null = null;
  let blurb: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!title) {
      const h = /^#\s+(.+)$/.exec(trimmed);
      if (h) title = h[1].trim();
      continue;
    }
    if (!trimmed) continue;
    blurb = trimmed;
    break;
  }
  return { title, blurb };
}

function fencesMatchBuiltin(
  extracted: string[],
  builtin: readonly HealthFence[],
): boolean {
  if (extracted.length !== builtin.length) return false;
  return extracted.every(
    (ex, i) => normalizeQql(ex) === normalizeQql(builtin[i].text),
  );
}

function interpolateFences(
  fences: HealthFence[],
  today: Date,
  days?: number,
): HealthFence[] {
  return fences.map((f) => ({
    ...f,
    text: interpolateCutoff(f.text, today, days ?? HEALTH_CUTOFF_DAYS),
  }));
}

/** 内置 11 条 + vault 按 basename 覆盖。永远 11 块。 */
export function resolveCatalog(
  notes: readonly HealthQueryNote[],
  today: Date,
): ResolvedHealthItem[] {
  const byBase = new Map<string, HealthQueryNote>();
  for (const n of notes) {
    if (!noteIsQuery(n)) continue;
    const base = posixBasename(n.path);
    if (!HEALTH_STARTER_BASENAMES.has(base)) continue;
    if (!byBase.has(base)) byBase.set(base, n);
  }

  return HEALTH_CATALOG.map((entry) => {
    const base = posixBasename(entry.starterPath);
    const vault = byBase.get(base);
    const days = entry.cutoffDays;
    if (!vault) {
      return {
        id: entry.id,
        metric: entry.metric,
        starterPath: entry.starterPath,
        titleKey: entry.titleKey,
        blurbKey: entry.blurbKey,
        render: entry.render,
        minCount: entry.minCount,
        cutoffDays: days,
        vaultPath: null,
        displayTitle: null,
        displayBlurb: null,
        fences: interpolateFences([...entry.fences], today, days),
      };
    }

    const extracted = extractQqlFences(vault.content);
    const { title, blurb } = displayFromMarkdown(vault.content);
    let fences: HealthFence[];
    if (extracted.length === 0 || fencesMatchBuiltin(extracted, entry.fences)) {
      fences = interpolateFences([...entry.fences], today, days);
    } else {
      fences = interpolateFences(
        extracted.map((text, i) => ({
          text,
          columns: entry.fences[i]?.columns ?? ["title"],
        })),
        today,
        days,
      );
    }
    return {
      id: entry.id,
      metric: entry.metric,
      starterPath: entry.starterPath,
      titleKey: entry.titleKey,
      blurbKey: entry.blurbKey,
      render: entry.render,
      minCount: entry.minCount,
      cutoffDays: days,
      vaultPath: vault.path,
      displayTitle: title,
      displayBlurb: blurb,
      fences,
    };
  });
}
