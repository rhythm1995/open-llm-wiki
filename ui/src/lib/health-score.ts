/**
 * health-score —— 库健康总览分数(纯逻辑,无 IO)。
 *
 * QQL 11 条仍是明细 IR。总览不重跑查询:用快照节点 + 图谱入度
 * (与 `mentioned_in.len()` 同一定义:已解析入边数)算出 MEASURE 同构的 KPI。
 *
 * 深度目标对齐 docs/14 / kb wiki-health:Active ≥ 2,Contested ≥ 3。
 */

import type { HealthMetricId } from "./health-catalog";
import type { ResultView } from "./qql-result";

export interface CensusNode {
  id: number;
  path: string;
  title: string;
  type: string | null;
  status: string | null;
  /** unix ms;缺省按中性新近度。 */
  modified?: number;
}

export interface CensusEdge {
  from: number;
  to: number | null;
}

export interface TypeBucket {
  total: number;
  digested: number;
  unprocessed: number;
  active: number;
  contested: number;
  superseded: number;
}

export interface HungryConcept {
  id: number;
  path: string;
  title: string;
  status: string | null;
  depth: number;
  target: number;
  ok: boolean;
}

export interface HealthCensus {
  sources: TypeBucket;
  summaries: TypeBucket;
  concepts: TypeBucket;
  entities: TypeBucket;
  orphans: number;
  hungry: number;
  singleSource: number;
  wikiPages: number;
  hungriest: HungryConcept[];
}

export const HUNGER_TARGET_ACTIVE = 2;
export const HUNGER_TARGET_CONTESTED = 3;
export const HUNGRIEST_LIMIT = 7;
export const FRONTIER_LIMIT = 5;
const RECENCY_FRESH_DAYS = 30;
const RECENCY_FLOOR = 0.25;

export type HealthNavGroupId = "structure" | "evidence" | "trust";

export const HEALTH_NAV_GROUPS: readonly {
  id: HealthNavGroupId;
  titleKey: string;
  metricIds: readonly HealthMetricId[];
}[] = [
  {
    id: "structure",
    titleKey: "health.group.structure",
    metricIds: ["contested", "orphans", "duplicates"],
  },
  {
    id: "evidence",
    titleKey: "health.group.evidence",
    metricIds: ["hunger", "synthesis", "evidence", "stale-sources"],
  },
  {
    id: "trust",
    titleKey: "health.group.trust",
    metricIds: ["provenance", "stale-agent", "drift", "mix"],
  },
];

const GRAPH_BADGE_IDS = new Set<HealthMetricId>([
  "contested",
  "orphans",
  "hunger",
  "synthesis",
]);

export function normType(type: string | null | undefined): string {
  return (type ?? "").trim().toLowerCase();
}

export function normStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** Active≥2;Contested≥3;其余按 Active。 */
export function hungerTarget(status: string | null | undefined): number {
  return normStatus(status) === "contested"
    ? HUNGER_TARGET_CONTESTED
    : HUNGER_TARGET_ACTIVE;
}

export interface FrontierPage {
  id: number;
  path: string;
  title: string;
  type: string;
  inDeg: number;
  outDeg: number;
  recency: number;
  score: number;
}

export function inboundDegrees(
  nodes: readonly CensusNode[],
  edges: readonly CensusEdge[],
): Map<number, number> {
  const deg = new Map<number, number>();
  for (const n of nodes) deg.set(n.id, 0);
  for (const e of edges) {
    if (e.to == null) continue;
    const cur = deg.get(e.to);
    if (cur == null) continue;
    deg.set(e.to, cur + 1);
  }
  return deg;
}

function emptyBucket(): TypeBucket {
  return {
    total: 0,
    digested: 0,
    unprocessed: 0,
    active: 0,
    contested: 0,
    superseded: 0,
  };
}

function countType(nodes: readonly CensusNode[], want: string): TypeBucket {
  const b = emptyBucket();
  for (const n of nodes) {
    if (normType(n.type) !== want) continue;
    b.total += 1;
    const s = normStatus(n.status);
    if (s === "digested") b.digested += 1;
    if (s === "unprocessed" || s === "") b.unprocessed += 1;
    if (s === "active" || s === "") b.active += 1;
    if (s === "contested") b.contested += 1;
    if (s === "superseded") b.superseded += 1;
  }
  return b;
}

export function outboundDegrees(
  nodes: readonly CensusNode[],
  edges: readonly CensusEdge[],
): Map<number, number> {
  const deg = new Map<number, number>();
  for (const n of nodes) deg.set(n.id, 0);
  for (const e of edges) {
    if (e.to == null) continue;
    const cur = deg.get(e.from);
    if (cur == null) continue;
    deg.set(e.from, cur + 1);
  }
  return deg;
}

/** 30 天内 1.0;之后按周衰减到 0.25。modified<=0 当 0.5。 */
export function recencyWeight(modifiedMs: number, nowMs: number): number {
  if (modifiedMs <= 0) return 0.5;
  const days = (nowMs - modifiedMs) / 86_400_000;
  if (days <= RECENCY_FRESH_DAYS) return 1;
  const weeks = (days - RECENCY_FRESH_DAYS) / 7;
  return Math.max(RECENCY_FLOOR, 1 - weeks * 0.05);
}

/**
 * 前沿页:(出度−入度)×新近度。只收主张/实体且 score>0。
 * 议程建议,不是记忆真相。
 */
export function frontierCandidates(
  nodes: readonly CensusNode[],
  edges: readonly CensusEdge[],
  nowMs: number = Date.now(),
): FrontierPage[] {
  const inn = inboundDegrees(nodes, edges);
  const out = outboundDegrees(nodes, edges);
  const rows: FrontierPage[] = [];
  for (const n of nodes) {
    const t = normType(n.type);
    if (t !== "concept" && t !== "entity") continue;
    const inDeg = inn.get(n.id) ?? 0;
    const outDeg = out.get(n.id) ?? 0;
    const recency = recencyWeight(n.modified ?? 0, nowMs);
    const score = (outDeg - inDeg) * recency;
    if (score <= 0) continue;
    rows.push({
      id: n.id,
      path: n.path,
      title: n.title || n.path,
      type: t,
      inDeg,
      outDeg,
      recency,
      score,
    });
  }
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  return rows.slice(0, FRONTIER_LIMIT);
}

export function censusFromSnapshot(
  nodes: readonly CensusNode[],
  edges: readonly CensusEdge[],
): HealthCensus {
  const deg = inboundDegrees(nodes, edges);
  const sources = countType(nodes, "source");
  const summaries = countType(nodes, "summary");
  const concepts = countType(nodes, "concept");
  const entities = countType(nodes, "entity");

  let orphans = 0;
  const hungriest: HungryConcept[] = [];
  let hungry = 0;
  let singleSource = 0;

  for (const n of nodes) {
    const t = normType(n.type);
    const depth = deg.get(n.id) ?? 0;
    if (t === "concept" || t === "entity") {
      if (depth === 0) orphans += 1;
    }
    if (t !== "concept") continue;
    const target = hungerTarget(n.status);
    const ok = depth >= target;
    if (!ok) hungry += 1;
    if (depth < 2) singleSource += 1;
    hungriest.push({
      id: n.id,
      path: n.path,
      title: n.title || n.path,
      status: n.status,
      depth,
      target,
      ok,
    });
  }

  hungriest.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return {
    sources,
    summaries,
    concepts,
    entities,
    orphans,
    hungry,
    singleSource,
    wikiPages: concepts.total + entities.total + summaries.total,
    hungriest: hungriest.filter((h) => !h.ok).slice(0, HUNGRIEST_LIMIT),
  };
}

export type NextActionId =
  | "contested"
  | "orphans"
  | "hunger"
  | "synthesis"
  | "ok";

/** 总览下一动作:先结构病,再喂深度。 */
export function nextAction(c: HealthCensus): NextActionId {
  if (c.concepts.contested > 0) return "contested";
  if (c.orphans > 0) return "orphans";
  if (c.hungry > 0) return "hunger";
  if (c.singleSource > 0) return "synthesis";
  return "ok";
}

export function nextActionMetric(action: NextActionId): HealthMetricId | null {
  if (action === "ok") return null;
  return action;
}

/** 侧栏角标:结构/饥饿用普查;其余等 QQL。 */
export function graphBadge(
  id: HealthMetricId,
  census: HealthCensus,
): number | undefined {
  switch (id) {
    case "contested":
      return census.concepts.contested;
    case "orphans":
      return census.orphans;
    case "hunger":
      return census.hungry;
    case "synthesis":
      return census.singleSource;
    default:
      return undefined;
  }
}

export function isGraphBadgeMetric(id: HealthMetricId): boolean {
  return GRAPH_BADGE_IDS.has(id);
}

/**
 * 信任三条在「几乎整库没 reviewed」时是字段噪音,不是内容病。
 * drift 条数 ≥ wiki 页的 80% 即提示。
 */
export function trustLooksUninstrumented(
  driftCount: number | undefined,
  wikiPages: number,
): boolean {
  if (driftCount == null || wikiPages <= 0) return false;
  return driftCount >= Math.ceil(wikiPages * 0.8);
}

export function resultCount(view: ResultView | ResultView[] | undefined): number | undefined {
  if (!view) return undefined;
  const views = Array.isArray(view) ? view : [view];
  let n = 0;
  for (const v of views) {
    if (v.kind === "error") return undefined;
    if (v.kind === "empty") continue;
    if (v.kind === "notes") n += v.rows.length;
    else if (v.kind === "groups") n += v.rows.filter((r) => !r.dimmed).length;
    else if (v.kind === "scalar") n += Math.trunc(v.value);
  }
  return n;
}
