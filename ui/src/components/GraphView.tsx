/**
 * GraphView —— 差异化之一:原生图谱视图(纯 SVG 力导向,无 d3 依赖)。
 *
 * 复刻 Obsidian 图谱的核心观感:节点按类型着色、按连接度变大小,边分 wiki/relation,
 * 当前笔记高亮,点击节点跳转。布局用极简 Fruchterman–Reingold:全对斥力 + 边弹簧 +
 * 向心引力,固定步数迭代(几百节点内瞬时完成)。
 *
 * **F-GRAPH 核心竞争力(本组件重点)**:
 * - 过滤:按 type / tag / relation(wiki/relation)显隐;隐藏孤儿;聚焦当前笔记 N 跳邻域。
 *   纯逻辑在 graph-filter.ts(已测),本组件只渲染过滤结果。
 * - 交互:鼠标滚轮缩放、拖拽平移、按钮缩放/重置。
 *
 * 这是「功能参考 Obsidian、实现参考 Tolaria 的可视化取向但独立编写」的产物。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Funnel,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsOutSimple,
  Target,
  X,
} from "@phosphor-icons/react";
import type { VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import {
  applyGraphFilters,
  distinctTags,
  distinctTypes,
  NO_FILTER,
  TYPELESS,
  type EdgeKind,
  type GraphFilters,
} from "../lib/graph-filter";
import { cn } from "../lib/cn";

interface Props {
  snapshot: VaultSnapshot | null;
  currentId: number | null;
  actions: VaultActions;
}

const W = 900;
const H = 640;
const MAX_NODES = 400;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

interface Pt {
  x: number;
  y: number;
}

// 类型 → 颜色(与主题调色板对齐)。
const TYPE_COLOR: Record<string, string> = {
  Source: "#f9e2af",
  Concept: "#cba6f7",
  Entity: "#94e2d5",
  Summary: "#a6e3a1",
  Note: "#89b4fa",
  [TYPELESS]: "#6c7086",
};
const colorFor = (type: string | null): string =>
  (type && TYPE_COLOR[type]) || TYPE_COLOR[TYPELESS];

/** 复制一个集合并翻转某成员的隶属。 */
function toggleSet<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

export function GraphView({ snapshot, currentId, actions }: Props) {
  const allNodes = snapshot?.nodes ?? [];
  const allEdges = snapshot?.edges ?? [];

  const types = useMemo(() => distinctTypes(allNodes), [allNodes]);
  const tags = useMemo(() => distinctTags(allNodes), [allNodes]);

  const [filters, setFilters] = useState<GraphFilters>(() => ({
    ...NO_FILTER,
    types: new Set(types),
    relations: new Set<EdgeKind>(["wiki", "relation"]),
  }));
  const [showFilters, setShowFilters] = useState(true);
  const [tf, setTf] = useState({ tx: 0, ty: 0, scale: 1 });
  const [hover, setHover] = useState<number | null>(null);
  const sizeRef = useRef({ w: W, h: H });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const filtered = useMemo(
    () => applyGraphFilters(allNodes, allEdges, filters),
    [allNodes, allEdges, filters],
  );

  // 力导向布局:仅在全节点/边集合变化时重算(位置随过滤切换保持稳定)。
  const pts = useMemo(() => {
    const n = allNodes.length;
    if (n === 0) return [] as Pt[];
    const count = Math.min(n, MAX_NODES);
    const { w, h } = sizeRef.current;
    const k = Math.sqrt((w * h) / count) * 0.6;
    let pos: Pt[] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        x: w / 2 + (Math.cos(a) * w) / 3 + ((i * 37) % 50),
        y: h / 2 + (Math.sin(a) * h) / 3 + ((i * 53) % 50),
      };
    });
    const adj = new Map<number, number[]>();
    for (const e of allEdges) {
      if (e.to == null) continue;
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
    }
    let t = w / 8;
    for (let it = 0; it < 180; it++) {
      const disp: Pt[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          let dx = pos[i].x - pos[j].x;
          let dy = pos[i].y - pos[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            d2 = 0.01;
            dx = 0.1;
            dy = 0.1;
          }
          const f = (k * k) / d2;
          const dist = Math.sqrt(d2);
          disp[i].x += (dx / dist) * f;
          disp[i].y += (dy / dist) * f;
        }
      }
      for (const [from, tos] of adj) {
        for (const to of tos) {
          const dx = pos[from].x - pos[to].x;
          const dy = pos[from].y - pos[to].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = (dist * dist) / k;
          disp[from].x -= (dx / dist) * f;
          disp[from].y -= (dy / dist) * f;
          disp[to].x += (dx / dist) * f;
          disp[to].y += (dy / dist) * f;
        }
      }
      for (let i = 0; i < n; i++) {
        disp[i].x += (w / 2 - pos[i].x) * 0.01;
        disp[i].y += (h / 2 - pos[i].y) * 0.01;
        const d = Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2) || 0.01;
        const lim = Math.min(d, t);
        pos[i].x += (disp[i].x / d) * lim;
        pos[i].y += (disp[i].y / d) * lim;
        pos[i].x = Math.max(10, Math.min(w - 10, pos[i].x));
        pos[i].y = Math.max(10, Math.min(h - 10, pos[i].y));
      }
      t *= 0.97;
    }
    return pos.slice(0, count);
  }, [allNodes, allEdges]);

  const degree = useMemo(() => {
    const d = new Map<number, number>();
    for (const e of filtered.edges) {
      if (e.to == null) continue;
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [filtered.edges]);

  // 原生非 passive 滚轮监听,确保 preventDefault 生效(阻止页面滚动/缩放)。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTf((cur) => {
        const scale = clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE);
        const r = scale / cur.scale;
        return { tx: px - (px - cur.tx) * r, ty: py - (py - cur.ty) * r, scale };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // 拖拽平移(window 级 mousemove/up,避免快速移出 svg 丢失)。
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = panRef.current;
      const svg = svgRef.current;
      if (!p || !svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - p.x) / rect.width) * W;
      const dy = ((e.clientY - p.y) / rect.height) * H;
      setTf((cur) => ({ ...cur, tx: p.tx + dx, ty: p.ty + dy }));
    };
    const onUp = () => {
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const zoomBy = (factor: number) =>
    setTf((cur) => ({
      tx: W / 2 - (W / 2 - cur.tx) * factor,
      ty: H / 2 - (H / 2 - cur.ty) * factor,
      scale: clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE),
    }));

  if (!snapshot || allNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">图谱为空 —— 打开一个含链接的 vault。</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-crust">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 平移面:铺满 viewBox,最先绘制(最底层);mousedown 启动平移。 */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="transparent"
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            panRef.current = { x: e.clientX, y: e.clientY, tx: tf.tx, ty: tf.ty };
          }}
        />
        <g transform={`translate(${tf.tx},${tf.ty}) scale(${tf.scale})`}>
          {/* 边 */}
          <g stroke-opacity="0.35">
            {filtered.edges.map((e, i) => {
              if (e.to == null) return null;
              const a = pts[e.from];
              const b = pts[e.to];
              if (!a || !b) return null;
              const isRel = e.kind === "relation";
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isRel ? "#cba6f7" : "#6c7086"}
                  strokeWidth={isRel ? 1.2 : 0.8}
                  strokeDasharray={isRel ? "3 3" : undefined}
                />
              );
            })}
            {filtered.edges
              .filter((e) => e.to == null && pts[e.from])
              .map((e, i) => {
                const a = pts[e.from];
                return (
                  <line
                    key={`unr-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={a.x + 12}
                    y2={a.y - 12}
                    stroke="#f38ba8"
                    strokeWidth={0.8}
                    strokeDasharray="2 2"
                  />
                );
              })}
          </g>
          {/* 节点 */}
          {allNodes
            .filter((n) => filtered.nodeIds.has(n.id))
            .slice(0, MAX_NODES)
            .map((node) => {
              const p = pts[node.id];
              if (!p) return null;
              const deg = degree.get(node.id) ?? 0;
              const r = 3 + Math.min(deg, 8) * 0.9;
              const isCurrent = node.id === currentId;
              const isHover = hover === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x},${p.y})`}
                  className="cursor-pointer"
                  onClick={() => actions.selectNote(node.path)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle
                    r={r + (isCurrent ? 3 : isHover ? 2 : 0)}
                    fill={colorFor(node.type)}
                    fillOpacity={isCurrent ? 1 : 0.85}
                    stroke={isCurrent ? "#cdd6f4" : "#181825"}
                    strokeWidth={isCurrent ? 1.5 : 0.6}
                  />
                  {(isHover || isCurrent) && (
                    <text x={r + 3} y={3} fontSize={10} fill="#cdd6f4" className="select-none">
                      {node.title}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
      </svg>

      {/* 统计 + 截断提示 */}
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-mantle/80 px-2 py-1 text-[11px] text-overlay">
        {filtered.nodeIds.size} 节点 · {filtered.edges.length} 边
        {allNodes.length > MAX_NODES && (
          <span className="text-red"> · 布局截断至 {MAX_NODES}</span>
        )}
      </div>

      {/* 缩放控件 */}
      <div className="absolute bottom-2 left-2 flex flex-col gap-1">
        <button
          onClick={() => zoomBy(1.2)}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text"
          title="放大"
        >
          <MagnifyingGlassPlus size={14} />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.2)}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text"
          title="缩小"
        >
          <MagnifyingGlassMinus size={14} />
        </button>
        <button
          onClick={() => setTf({ tx: 0, ty: 0, scale: 1 })}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text"
          title="重置视图"
        >
          <ArrowsOutSimple size={14} />
        </button>
      </div>

      {/* 过滤面板切换 */}
      <button
        onClick={() => setShowFilters((v) => !v)}
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 rounded px-2 py-1 text-[11px]",
          showFilters ? "bg-blue text-crust" : "bg-mantle/80 text-overlay hover:text-text",
        )}
      >
        <Funnel size={13} />
        过滤
      </button>

      {showFilters && (
        <FilterPanel
          types={types}
          tags={tags}
          filters={filters}
          currentId={currentId}
          onChange={setFilters}
          onReset={() =>
            setFilters({
              ...NO_FILTER,
              types: new Set(types),
              relations: new Set<EdgeKind>(["wiki", "relation"]),
            })
          }
          nodes={allNodes}
        />
      )}
    </div>
  );
}

function FilterPanel({
  types,
  tags,
  filters,
  currentId,
  onChange,
  onReset,
  nodes,
}: {
  types: string[];
  tags: string[];
  filters: GraphFilters;
  currentId: number | null;
  onChange: (f: GraphFilters) => void;
  onReset: () => void;
  nodes: { id: number; type: string | null; tags: string[] }[];
}) {
  const typeCount = (t: string) =>
    nodes.filter((n) => (n.type ?? TYPELESS) === t).length;
  const tagCount = (t: string) => nodes.filter((n) => n.tags.includes(t)).length;

  return (
    <div className="absolute right-2 top-9 max-h-[calc(100%-3rem)] w-52 overflow-y-auto rounded bg-mantle/95 p-2 text-[11px] shadow-lg ring-1 ring-crust">
      <Section title="类型">
        {types.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
            <input
              type="checkbox"
              checked={filters.types.has(t)}
              onChange={() => onChange({ ...filters, types: toggleSet(filters.types, t) })}
              className="accent-[var(--color-blue)]"
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: colorFor(t === TYPELESS ? null : t) }}
            />
            <span className="flex-1 truncate">{t === TYPELESS ? "无类型" : t}</span>
            <span className="text-overlay">{typeCount(t)}</span>
          </label>
        ))}
      </Section>

      {tags.length > 0 && (
        <Section title="标签">
          {tags.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
              <input
                type="checkbox"
                checked={filters.tags.has(t)}
                onChange={() => onChange({ ...filters, tags: toggleSet(filters.tags, t) })}
                className="accent-[var(--color-teal)]"
              />
              <span className="flex-1 truncate">#{t}</span>
              <span className="text-overlay">{tagCount(t)}</span>
            </label>
          ))}
        </Section>
      )}

      <Section title="边类型">
        {(["wiki", "relation"] as EdgeKind[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
            <input
              type="checkbox"
              checked={filters.relations.has(k)}
              onChange={() => onChange({ ...filters, relations: toggleSet(filters.relations, k) })}
            />
            <span>{k === "wiki" ? "正文链接" : "frontmatter 关系"}</span>
          </label>
        ))}
      </Section>

      <label className="mt-1 flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
        <input
          type="checkbox"
          checked={filters.hideOrphans}
          onChange={() => onChange({ ...filters, hideOrphans: !filters.hideOrphans })}
        />
        <span>隐藏孤儿节点</span>
      </label>

      <div className="mt-2 border-t border-crust pt-2">
        {filters.focusId != null ? (
          <>
            <div className="mb-1 flex items-center justify-between text-subtext">
              <span className="flex items-center gap-1">
                <Target size={11} /> 聚焦邻域
              </span>
              <button onClick={() => onChange({ ...filters, focusId: null })} className="text-overlay hover:text-red">
                <X size={12} />
              </button>
            </div>
            <div className="flex items-center gap-1 text-overlay">
              <span>跳数</span>
              <input
                type="range"
                min={1}
                max={5}
                value={filters.hops}
                onChange={(e) => onChange({ ...filters, hops: Number(e.target.value) })}
                className="flex-1 accent-[var(--color-blue)]"
              />
              <span className="w-4 text-right text-subtext">{filters.hops}</span>
            </div>
          </>
        ) : (
          <button
            disabled={currentId == null}
            onClick={() => currentId != null && onChange({ ...filters, focusId: currentId, hops: 1 })}
            className="w-full rounded bg-surface px-1.5 py-1 text-subtext hover:bg-surface2 disabled:opacity-40"
          >
            <span className="flex items-center justify-center gap-1">
              <Target size={11} /> 聚焦当前笔记
            </span>
          </button>
        )}
      </div>

      <button
        onClick={onReset}
        className="mt-2 w-full rounded bg-surface px-1.5 py-1 text-overlay hover:bg-surface2"
      >
        重置过滤
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-overlay">{title}</div>
      {children}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
