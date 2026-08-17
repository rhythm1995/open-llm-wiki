/**
 * HealthView —— 库健康。
 *
 * 总览分数来自快照图谱(即时,与 mentioned_in 同口径)。
 * 左侧 11 条锁定 QQL 是明细;进视图后台扫一遍好出角标。
 * 不是 QueryPanel,不是 lint 列表。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heartbeat, Robot } from "@phosphor-icons/react";
import { ipc, type VaultSnapshot } from "../lib/ipc";
import {
  HEALTH_NAV_GROUPS,
  censusFromSnapshot,
  frontierCandidates,
  graphBadge,
  hungerTarget,
  isGraphBadgeMetric,
  nextAction,
  nextActionMetric,
  resultCount,
  trustLooksUninstrumented,
  type HealthCensus,
  type NextActionId,
} from "../lib/health-score";
import {
  resolveCatalog,
  type HealthMetricId,
  type HealthQueryNote,
  type ResolvedHealthItem,
} from "../lib/health-catalog";
import {
  combinedBadge,
  flattenResult,
  resultBadge,
  type ResultView,
} from "../lib/qql-result";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { labelStatus } from "../lib/wiki-labels";

export interface HealthViewProps {
  root: string;
  snapshot: VaultSnapshot | null;
  queryNotes: HealthQueryNote[];
  t: TFunc;
  onOpenNote: (path: string) => void;
  onAskAgent: (question?: string) => void;
  /** 从「问 Agent」分流过来的指标:进入视图即跑并选中。 */
  focusMetric?: HealthMetricId | null;
  onFocusConsumed?: () => void;
}

type StoredResult = ResultView | ResultView[];

const SWEEP_CONCURRENCY = 3;

export function HealthView({
  root,
  snapshot,
  queryNotes,
  t,
  onOpenNote,
  onAskAgent,
  focusMetric = null,
  onFocusConsumed,
}: HealthViewProps) {
  const today = useMemo(() => new Date(), [queryNotes]);
  const catalog = useMemo(
    () => resolveCatalog(queryNotes, today),
    [queryNotes, today],
  );
  const census = useMemo(
    () =>
      censusFromSnapshot(snapshot?.nodes ?? [], snapshot?.edges ?? []),
    [snapshot],
  );
  const frontier = useMemo(
    () => frontierCandidates(snapshot?.nodes ?? [], snapshot?.edges ?? []),
    [snapshot],
  );
  const [selectedId, setSelectedId] = useState<HealthMetricId | null>(null);
  const [results, setResults] = useState<
    Partial<Record<HealthMetricId, StoredResult>>
  >({});
  const [pending, setPending] = useState<HealthMetricId | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const sweepGen = useRef(0);

  const runOne = useCallback(
    async (id: HealthMetricId): Promise<StoredResult | null> => {
      const item = catalog.find((c) => c.id === id);
      if (!item) return null;
      const views: ResultView[] = [];
      for (const fence of item.fences) {
        const rs = await ipc.runQql(root, fence.text);
        views.push(
          flattenResult(
            rs,
            snapshot?.nodes ?? [],
            fence.columns,
            item.minCount,
          ),
        );
      }
      return views.length === 1 ? views[0]! : views;
    },
    [catalog, root, snapshot],
  );

  const selectMetric = useCallback(
    async (id: HealthMetricId) => {
      setSelectedId(id);
      setError(null);
      setOpenGroup(null);
      setPending(id);
      try {
        const stored = await runOne(id);
        if (stored) {
          setResults((prev) => ({ ...prev, [id]: stored }));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setResults((prev) => ({
          ...prev,
          [id]: { kind: "error", message },
        }));
      } finally {
        setPending((p) => (p === id ? null : p));
      }
    },
    [runOne],
  );

  useEffect(() => {
    if (ipc.isMock()) return;
    const gen = ++sweepGen.current;
    let cancelled = false;
    setSweeping(true);
    const ids = catalog.map((c) => c.id);
    void (async () => {
      const queue = [...ids];
      const worker = async () => {
        while (queue.length && !cancelled && sweepGen.current === gen) {
          const id = queue.shift()!;
          try {
            const stored = await runOne(id);
            if (cancelled || sweepGen.current !== gen || !stored) continue;
            setResults((prev) => ({ ...prev, [id]: stored }));
          } catch {
            if (cancelled || sweepGen.current !== gen) continue;
            setResults((prev) => ({
              ...prev,
              [id]: { kind: "error", message: "sweep failed" },
            }));
          }
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(SWEEP_CONCURRENCY, ids.length) },
          () => worker(),
        ),
      );
      if (!cancelled && sweepGen.current === gen) setSweeping(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog, runOne]);

  useEffect(() => {
    if (!focusMetric) return;
    void selectMetric(focusMetric);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟 focus 走
  }, [focusMetric]);

  const selected = catalog.find((c) => c.id === selectedId) ?? null;
  const stored = selectedId ? (results[selectedId] ?? null) : null;
  const sections: ResultView[] = stored
    ? Array.isArray(stored)
      ? stored
      : [stored]
    : [];
  const action = nextAction(census);
  const driftN = resultCount(results.drift);
  const trustNoisy = trustLooksUninstrumented(driftN, census.wikiPages);

  return (
    <div
      data-testid="health-view"
      className="flex h-full min-h-0 flex-col bg-base text-text"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-crust px-3 py-2">
        <Heartbeat size={16} className="text-blue" weight="fill" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[13px] font-medium">{t("health.title")}</h1>
          <p className="text-[11px] text-overlay">
            {t("health.readonly")}
            {sweeping && !ipc.isMock() ? ` · ${t("health.sweeping")}` : ""}
          </p>
        </div>
        <form
          className="flex min-w-[12rem] flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onAskAgent(ask.trim() || undefined);
            setAsk("");
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={t("health.askAgentPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-crust bg-surface px-2 py-1 text-[12px] text-text outline-none placeholder:text-overlay focus:border-blue/50"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            <Robot size={12} />
            {t("health.askAgent")}
          </button>
        </form>
      </header>

      {ipc.isMock() && (
        <p className="shrink-0 border-b border-yellow/30 bg-yellow/10 px-3 py-1.5 text-[11px] text-subtext">
          {t("health.mockHint")}
        </p>
      )}

      <Scorecard
        census={census}
        driftCount={driftN}
        selectedId={selectedId}
        onPick={(id) => {
          if (id) void selectMetric(id);
          else setSelectedId(null);
        }}
        t={t}
      />

      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 overflow-y-auto border-r border-crust p-2">
          <button
            type="button"
            data-testid="health-overview"
            onClick={() => setSelectedId(null)}
            className={cn(
              "mb-2 flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px]",
              selectedId == null
                ? "bg-blue/15 font-medium text-blue"
                : "text-subtext hover:bg-surface hover:text-text",
            )}
          >
            {t("health.overview")}
          </button>
          {HEALTH_NAV_GROUPS.map((g) => (
            <div key={g.id} className="mb-2">
              <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-overlay">
                {t(g.titleKey)}
              </div>
              {g.metricIds.map((id) => {
                const item = catalog.find((c) => c.id === id);
                if (!item) return null;
                const badge = navBadge(id, census, results[id], item.minCount);
                const active = selectedId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`health-metric-${id}`}
                    onClick={() => void selectMetric(id)}
                    className={cn(
                      "mb-0.5 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
                      active
                        ? "bg-blue/15 text-blue"
                        : "text-subtext hover:bg-surface hover:text-text",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.displayTitle || t(item.titleKey)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[10px]",
                        badgeTone(id, badge),
                      )}
                    >
                      {pending === id
                        ? "…"
                        : badge === undefined
                          ? "—"
                          : badge}
                    </span>
                  </button>
                );
              })}
              {g.id === "trust" && (
                <p className="px-2 pt-0.5 text-[10px] leading-snug text-overlay">
                  {t("health.group.trustHint")}
                </p>
              )}
            </div>
          ))}
        </nav>

        <section className="min-w-0 flex-1 overflow-y-auto p-3">
          {selectedId == null ? (
            <OverviewPane
              census={census}
              frontier={frontier}
              action={action}
              trustNoisy={trustNoisy}
              onOpenNote={onOpenNote}
              onFollow={(id) => void selectMetric(id)}
              t={t}
            />
          ) : selected ? (
            <MetricPane
              item={selected}
              sections={sections}
              pending={pending === selected.id}
              error={error}
              snapshot={snapshot}
              openGroup={openGroup}
              onToggleGroup={setOpenGroup}
              onOpenNote={onOpenNote}
              t={t}
            />
          ) : (
            <p className="text-[12px] text-overlay">{t("health.emptyHint")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function navBadge(
  id: HealthMetricId,
  census: HealthCensus,
  stored: StoredResult | undefined,
  minCount?: number,
): number | "!" | undefined {
  if (isGraphBadgeMetric(id)) return graphBadge(id, census);
  if (!stored) return undefined;
  const views = Array.isArray(stored) ? stored : [stored];
  return combinedBadge(views, minCount);
}

function badgeTone(id: HealthMetricId, badge: number | "!" | undefined): string {
  if (badge === "!") return "text-red";
  if (badge == null) return "text-overlay";
  if (id === "evidence" || id === "mix") return "text-overlay";
  if (badge === 0) return "text-teal";
  return "text-yellow";
}

function Scorecard({
  census,
  driftCount,
  selectedId,
  onPick,
  t,
}: {
  census: HealthCensus;
  driftCount: number | undefined;
  selectedId: HealthMetricId | null;
  onPick: (id: HealthMetricId | null) => void;
  t: TFunc;
}) {
  const claimsOk = census.concepts.total - census.hungry;
  const cards: Array<{
    testid: string;
    label: string;
    value: string;
    hint?: string;
    metric: HealthMetricId | null;
    alarm: boolean;
  }> = [
    {
      testid: "health-card-sources",
      label: t("health.card.sources"),
      value: `${census.sources.digested} / ${census.sources.total}`,
      hint: t("health.card.sources.hint"),
      metric: "stale-sources",
      alarm:
        census.sources.total > 0 &&
        census.sources.digested < census.sources.total,
    },
    {
      testid: "health-card-claims",
      label: t("health.card.claims"),
      value: `${Math.max(0, claimsOk)} / ${census.concepts.total}`,
      hint: t("health.card.claims.hint"),
      metric: "hunger",
      alarm: census.hungry > 0,
    },
    {
      testid: "health-card-contested",
      label: t("health.card.contested"),
      value: String(census.concepts.contested),
      metric: "contested",
      alarm: census.concepts.contested > 0,
    },
    {
      testid: "health-card-orphans",
      label: t("health.card.orphans"),
      value: String(census.orphans),
      metric: "orphans",
      alarm: census.orphans > 0,
    },
    {
      testid: "health-card-single",
      label: t("health.card.single"),
      value: String(census.singleSource),
      metric: "synthesis",
      alarm: census.singleSource > 0,
    },
    {
      testid: "health-card-trust",
      label: t("health.card.trust"),
      value: driftCount == null ? "—" : String(driftCount),
      metric: "drift",
      alarm: driftCount != null && driftCount > 0,
    },
  ];
  return (
    <div
      data-testid="health-scorecard"
      className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-crust px-3 py-2 sm:grid-cols-3 lg:grid-cols-6"
    >
      {cards.map((c) => {
        const active = c.metric != null && selectedId === c.metric;
        return (
          <button
            key={c.testid}
            type="button"
            data-testid={c.testid}
            onClick={() => onPick(c.metric)}
            className={cn(
              "rounded-md border px-2 py-1.5 text-left",
              active
                ? "border-blue/40 bg-blue/10"
                : "border-crust/80 bg-mantle hover:bg-surface",
            )}
          >
            <div className="text-[10px] uppercase tracking-wide text-overlay">
              {c.label}
            </div>
            <div
              className={cn(
                "text-[15px] font-medium tabular-nums",
                c.alarm ? "text-yellow" : "text-text",
              )}
            >
              {c.value}
            </div>
            {c.hint && (
              <div className="truncate text-[10px] text-overlay">{c.hint}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function OverviewPane({
  census,
  frontier,
  action,
  trustNoisy,
  onOpenNote,
  onFollow,
  t,
}: {
  census: HealthCensus;
  frontier: ReturnType<typeof frontierCandidates>;
  action: NextActionId;
  trustNoisy: boolean;
  onOpenNote: (path: string) => void;
  onFollow: (id: HealthMetricId) => void;
  t: TFunc;
}) {
  const follow = nextActionMetric(action);
  return (
    <div data-testid="health-overview-pane">
      <p className="text-[12px] leading-relaxed text-subtext">
        {t("health.overview.blurb")}
      </p>
      <button
        type="button"
        data-testid="health-next-action"
        onClick={() => follow && onFollow(follow)}
        className={cn(
          "mt-3 w-full rounded-md border border-crust/80 bg-surface/40 px-2.5 py-2 text-left text-[12px]",
          follow && "hover:bg-surface",
        )}
      >
        {t(`health.next.${action}`)}
      </button>
      {trustNoisy && (
        <p className="mt-2 text-[11px] text-overlay">{t("health.group.trustHint")}</p>
      )}
      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-overlay">
        {t("health.hungriest")}
      </h3>
      {census.hungriest.length === 0 ? (
        <p className="mt-1 text-[12px] text-overlay">{t("health.empty")}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {census.hungriest.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onOpenNote(h.path)}
                className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate text-text">{h.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-yellow">
                  {h.depth}/{h.target}
                </span>
                {h.status && (
                  <span className="shrink-0 text-[10px] text-overlay">
                    {labelStatus(h.status, t)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-4" data-testid="health-frontier">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-overlay">
          {t("health.frontier")}
        </summary>
        <p className="mt-1 text-[11px] leading-relaxed text-overlay">
          {t("health.frontier.hint")}
        </p>
        {frontier.length === 0 ? (
          <p className="mt-1 text-[12px] text-overlay">{t("health.empty")}</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {frontier.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onOpenNote(f.path)}
                  className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface"
                >
                  <span className="min-w-0 flex-1 truncate text-text">{f.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-overlay">
                    {f.outDeg}−{f.inDeg}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function MetricPane({
  item,
  sections,
  pending,
  error,
  snapshot,
  openGroup,
  onToggleGroup,
  onOpenNote,
  t,
}: {
  item: ResolvedHealthItem;
  sections: ResultView[];
  pending: boolean;
  error: string | null;
  snapshot: VaultSnapshot | null;
  openGroup: string | null;
  onToggleGroup: (key: string | null) => void;
  onOpenNote: (path: string) => void;
  t: TFunc;
}) {
  const title = item.displayTitle || t(item.titleKey);
  const blurb = item.displayBlurb || t(item.blurbKey);
  const dual = item.id === "stale-sources" && item.fences.length === 2;
  return (
    <div>
      <div className="mb-2">
        <h2 className="text-[14px] font-medium">{title}</h2>
        {item.vaultPath && (
          <p className="font-mono text-[10px] text-overlay">{item.vaultPath}</p>
        )}
        <p className="mt-1 text-[12px] leading-relaxed text-subtext">{blurb}</p>
      </div>
      <details className="mb-3 rounded-md border border-crust bg-mantle px-2 py-1">
        <summary className="cursor-pointer text-[11px] text-overlay">
          {t("health.irPreview")}
        </summary>
        {item.fences.map((f, i) => (
          <pre
            key={i}
            className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-subtext"
          >
            {f.text}
          </pre>
        ))}
      </details>
      {pending && (
        <p className="text-[12px] text-overlay">{t("health.running")}</p>
      )}
      {error && (
        <pre className="mb-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-red">
          {t("health.error")}: {error}
        </pre>
      )}
      {sections.map((view, i) => (
        <div key={i} className="mb-4">
          {dual && (
            <h3 className="mb-1 text-[11px] font-medium text-overlay">
              {i === 0
                ? t("health.section.overdue")
                : t("health.section.missingField")}
            </h3>
          )}
          <ResultBlock
            view={view}
            snapshot={snapshot}
            openGroup={openGroup}
            onToggleGroup={onToggleGroup}
            onOpenNote={onOpenNote}
            hunger={item.id === "hunger"}
            t={t}
          />
        </div>
      ))}
    </div>
  );
}

function ResultBlock({
  view,
  snapshot,
  openGroup,
  onToggleGroup,
  onOpenNote,
  hunger,
  t,
}: {
  view: ResultView;
  snapshot: VaultSnapshot | null;
  openGroup: string | null;
  onToggleGroup: (key: string | null) => void;
  onOpenNote: (path: string) => void;
  hunger: boolean;
  t: TFunc;
}) {
  if (view.kind === "empty") {
    return <p className="text-[12px] text-overlay">{t("health.empty")}</p>;
  }
  if (view.kind === "error") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[11px] text-red">
        {view.message}
      </pre>
    );
  }
  if (view.kind === "scalar") {
    return (
      <p className="text-[20px] font-medium tabular-nums">
        {view.label === "sum" ? view.value : resultBadge(view)}
      </p>
    );
  }
  if (view.kind === "notes") {
    const extra = hunger
      ? [t("health.hunger.status"), t("health.hunger.target")]
      : [];
    const cols = [...view.columns, ...extra];
    return (
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-overlay">
            {cols.map((c) => (
              <th key={c} className="border-b border-crust px-1.5 py-1 font-medium">
                {c === "depth" ? t("health.hunger.depth") : c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => {
            const node = snapshot?.nodes.find((n) => n.id === row.id);
            const depth = Number(row.cells[1] ?? 0);
            const target = hungerTarget(node?.status ?? null);
            const weak = hunger && Number.isFinite(depth) && depth < target;
            const clickable = !!row.path;
            const cells = hunger
              ? [
                  ...row.cells,
                  node?.status ? labelStatus(node.status, t) : "—",
                  String(target),
                ]
              : row.cells;
            return (
              <tr
                key={row.id}
                className={cn(
                  clickable && "cursor-pointer hover:bg-surface",
                  weak && "bg-yellow/10",
                )}
                onClick={() => clickable && onOpenNote(row.path!)}
              >
                {cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "border-b border-crust/60 px-1.5 py-1",
                      weak && i === 1 && "font-medium text-yellow",
                    )}
                  >
                    {cell ?? "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const max = Math.max(1, ...view.rows.map((r) => r.count));
  return (
    <ul className="space-y-0.5">
      {view.rows.map((row) => {
        const open = openGroup === row.key;
        return (
          <li key={row.key} className={cn(row.dimmed && "opacity-40")}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-surface"
              onClick={() => onToggleGroup(open ? null : row.key)}
            >
              <span className="min-w-0 flex-1 truncate">
                {row.key || "(none)"}
              </span>
              <span className="font-mono text-[10px] text-overlay">
                {row.count}
              </span>
              <span
                className="h-1.5 w-16 overflow-hidden rounded bg-surface"
                aria-hidden
              >
                <span
                  className="block h-full bg-blue/50"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </span>
            </button>
            {open && (
              <ul className="mb-1 ml-3 border-l border-crust pl-2">
                {row.ids.map((id) => {
                  const n = snapshot?.nodes.find((x) => x.id === id);
                  if (!n) {
                    return (
                      <li
                        key={id}
                        className="py-0.5 text-[11px] text-overlay"
                      >
                        #{id}
                      </li>
                    );
                  }
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="py-0.5 text-[11px] text-subtext hover:text-blue"
                        onClick={() => onOpenNote(n.path)}
                      >
                        {n.title || n.path}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
