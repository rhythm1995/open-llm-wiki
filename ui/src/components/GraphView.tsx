/**
 * GraphView —— 差异化之一:原生图谱视图(纯 SVG 力导向,无 d3 依赖)。
 *
 * 复刻 Obsidian Graph 的核心观感与手感:
 * - 节点按类型着色、按连接度变大小;当前笔记高亮 + 光晕。
 * - 边分 wiki/relation;整体透明度随缩放衰减,低倍率时不糊成一片。
 * - 标签带描边光晕(paint-order),按缩放/度数/悬停分级显隐,远处可读。
 * - 悬停某节点 → 高亮其邻域(非邻居节点与边压暗)。
 * - 交互:滚轮缩放到光标、拖拽平移、**拖拽节点**(临时钉住)、点击打开、双击聚焦邻域、右键菜单。
 * - 适应视图:按可见节点的包围盒算变换,首屏自动 fit。
 *
 * 布局纯逻辑在 {@link file://../lib/graph-layout.ts}(已测);本组件只负责
 * 持有持久位置 ref、调和 + 调用 relaxLayout,以及渲染/交互。
 * 过滤纯逻辑在 graph-filter.ts(已测),本组件只渲染过滤结果。
 *
 * 这是「功能参考 Obsidian、实现独立编写」的产物。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Funnel,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsOutSimple,
  Target,
  X,
  ArrowSquareOut,
  Copy,
  EyeSlash,
} from "@phosphor-icons/react";
import type { NodeOut, VaultSnapshot } from "../lib/ipc";
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
import {
  bbox,
  fitTransform,
  relaxLayout,
  seedNodes,
  visibleNodeIds,
  type Pt,
} from "../lib/graph-layout";
import { nodeWikilink } from "../lib/wikilink";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface Props {
  snapshot: VaultSnapshot | null;
  currentId: number | null;
  actions: VaultActions;
  t: TFunc;
}

const MAX_NODES = 400;
const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const FIT_PAD = 60;
// 视口剔除:节点数过此阈值才裁屏外,否则小图全画(免边缘 pop-in + 省计算)。
const CULL_THRESHOLD = 200;
// 屏幕像素留白:平移时边缘节点提前入场,减少闪烁。
const CULL_MARGIN = 80;

// 类型 → 颜色(引用主题令牌 var(--color-*),随明/暗自动切换)。
// 注:SVG 的 fill/stroke **呈现属性**不解析 CSS 变量,故这些值经由 style={{...}}
// 注入(走 CSS 属性才解析 var());见下方 circle/line 的 style 用法。
const TYPE_COLOR: Record<string, string> = {
  Source: "var(--color-yellow)",
  Concept: "var(--color-mauve)",
  Entity: "var(--color-teal)",
  Summary: "var(--color-green)",
  Note: "var(--color-blue)",
  [TYPELESS]: "var(--color-overlay)",
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * ResizeObserver 测量容器真实尺寸。图谱用真实像素作 viewBox,svg 1:1 填满,
 * 既无 letterbox、也使「屏幕↔图」坐标换算为线性(svg 宽度 = viewBox 宽度)。
 */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  // 初值 {0,0}:在 ResizeObserver 测到真实尺寸前,布局/fit 据此跳过(避免用占位尺寸排布)。
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export function GraphView({ snapshot, currentId, actions, t }: Props) {
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
  // 右键菜单:命中的节点 + 视口坐标;null 表示关闭。
  const [menu, setMenu] = useState<{ x: number; y: number; node: NodeOut } | null>(null);
  // 节点拖拽中的 id(同时用于改光标);null = 空闲。
  const [dragging, setDragging] = useState<number | null>(null);

  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragRef = useRef<{ id: number } | null>(null);
  // 拖拽位移标记:mouseup 后 click 才触发,故用独立 ref(不在 onUp 里清)区分「拖拽」与「点击打开」。
  const dragMovedRef = useRef(false);
  // 持久节点位置(键为 node.id):跨快照/过滤稳定,只在结构变化时增量调和 + 松弛。
  const posRef = useRef<Map<number, Pt>>(new Map());

  const filtered = useMemo(
    () => applyGraphFilters(allNodes, allEdges, filters),
    [allNodes, allEdges, filters],
  );

  // 度数(基于可见边):用于节点尺寸、超量截断、标签分级。
  const degree = useMemo(() => {
    const d = new Map<number, number>();
    for (const e of filtered.edges) {
      if (e.to == null) continue;
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [filtered.edges]);

  // 渲染集:超量时按度数取 top-K(保留枢纽,而非按 id 截断)。
  const renderIds = useMemo(() => {
    const ids = [...filtered.nodeIds];
    if (ids.length <= MAX_NODES) return ids;
    return ids
      .sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a - b)
      .slice(0, MAX_NODES);
  }, [filtered.nodeIds, degree]);
  const renderSet = useMemo(() => new Set(renderIds), [renderIds]);

  // 邻接表(仅渲染集):悬停高亮邻域 + 播种就近邻居共用。
  const adj = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of filtered.edges) {
      if (e.to == null) continue;
      if (!renderSet.has(e.from) || !renderSet.has(e.to)) continue;
      if (!m.has(e.from)) m.set(e.from, []);
      if (!m.has(e.to)) m.set(e.to, []);
      m.get(e.from)!.push(e.to);
      m.get(e.to)!.push(e.from);
    }
    return m;
  }, [filtered.edges, renderSet]);

  // 结构签名:节点集 + 边集的内容哈希。仅当结构变化时才重排(pan/zoom/hover 不触发)。
  const sig = useMemo(() => {
    const idStr = [...renderIds].sort((a, b) => a - b).join(",");
    const eStr = filtered.edges
      .map((e) => `${e.from}->${e.to ?? "?"}`)
      .sort()
      .join(",");
    return `${renderIds.length}|${idStr}|${eStr}`;
  }, [renderIds, filtered.edges]);

  // 布局:调和 posRef(增/删)→ 播种新节点 → 以既有位置为初值松弛。
  // 在 render 中经 useMemo 执行(幂等,键为 sig+w+h);posRef 持久持有故跨帧稳定。
  // 尺寸未测到(w=0)时跳过,等 ResizeObserver 给真实值再排布。
  useMemo(() => {
    if (size.w === 0 || size.h === 0) return null;
    const pos = posRef.current;
    const live = renderSet;
    for (const id of [...pos.keys()]) if (!live.has(id)) pos.delete(id);
    const newIds = renderIds.filter((id) => !pos.has(id));
    if (newIds.length > 0) seedNodes(newIds, adj, pos, { w: size.w, h: size.h });
    const springs = filtered.edges
      .filter((e) => e.to != null && live.has(e.from) && live.has(e.to))
      .map((e) => ({ from: e.from, to: e.to as number }));
    relaxLayout(renderIds, springs, pos, {
      w: size.w,
      h: size.h,
      iterations: renderIds.length > 250 ? 90 : 130,
    });
    return sig + size.w + size.h;
  }, [sig, size.w, size.h, renderIds, renderSet, adj, filtered.edges]);

  // 首次布局完成 → 自动 fit 到视图(只做一次,且需已测到真实尺寸)。
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (renderIds.length === 0 || size.w === 0 || size.h === 0) return;
    const box = bbox(renderIds, posRef.current);
    setTf(fitTransform(box, size.w, size.h, FIT_PAD, MIN_SCALE, MAX_SCALE));
    didFitRef.current = true;
  }, [renderIds, size.w, size.h]);

  const fit = useCallback(() => {
    const box = bbox(renderIds, posRef.current);
    setTf(fitTransform(box, size.w, size.h, FIT_PAD, MIN_SCALE, MAX_SCALE));
  }, [renderIds, size.w, size.h]);

  // 悬停邻域:非邻居压暗。
  const neighbors = useMemo(() => {
    if (hover == null) return null;
    const ns = new Set<number>([hover]);
    for (const n of adj.get(hover) ?? []) ns.add(n);
    return ns;
  }, [hover, adj]);

  // 右键菜单项:打开 / 聚焦此节点邻域 / (清除聚焦) / 复制 wikilink / 隐藏此类型。
  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    const n = menu.node;
    const tp = n.type ?? TYPELESS;
    const items: MenuItem[] = [
      {
        label: t("graph.menu.open"),
        icon: <ArrowSquareOut size={13} />,
        onClick: () => actions.selectNote(n.path),
      },
      {
        label: t("graph.menu.focus"),
        icon: <Target size={13} />,
        onClick: () => setFilters((f) => ({ ...f, focusId: n.id, hops: 1 })),
      },
    ];
    if (filters.focusId != null) {
      items.push({
        label: t("graph.menu.clearFocus"),
        icon: <X size={13} />,
        onClick: () => setFilters((f) => ({ ...f, focusId: null })),
      });
    }
    items.push(
      { separator: true, label: "" },
      {
        label: t("graph.menu.copyLink"),
        icon: <Copy size={13} />,
        onClick: () => {
          const text = nodeWikilink(n.title, n.path);
          navigator.clipboard?.writeText(text).catch(() => {});
        },
      },
      { separator: true, label: "" },
      {
        label: t("graph.menu.hideType", { type: n.type ?? t("graph.typeless") }),
        icon: <EyeSlash size={13} />,
        onClick: () => setFilters((f) => ({ ...f, types: toggleSet(f.types, tp) })),
      },
    );
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, filters, t, actions]);

  /** 屏幕(视口)坐标 → 图坐标(viewBox,1:1 于容器)。 */
  const toView = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  // tf 的 ref 镜像:拖拽/平移的 window 监听只订阅一次,内部读 tfRef.current 拿最新值,
  // 避免随 tf 变化反复 add/remove 监听(平移时每帧都会改 tf)。
  const tfRef = useRef(tf);
  tfRef.current = tf;
  // 节点拖拽时 posRef 原地改,但 React 不会因此重渲染;用一个 tick 强制刷新,让被拖节点跟手。
  const [, bumpDrag] = useReducer((x: number) => x + 1, 0);

  // 滚轮缩放到光标(原生非 passive,确保 preventDefault 生效)。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = toView(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTf((cur) => {
        const scale = clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE);
        const r = scale / cur.scale;
        return { tx: v.x - (v.x - cur.tx) * r, ty: v.y - (v.y - cur.ty) * r, scale };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toView]);

  // 平移 + 节点拖拽(window 级监听,避免快速移出 svg 丢失)。订阅一次,读 ref。
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) {
        const v = toView(e.clientX, e.clientY);
        const { tx, ty, scale } = tfRef.current;
        const gx = (v.x - tx) / scale;
        const gy = (v.y - ty) / scale;
        const p = posRef.current.get(d.id);
        // 超过阈值即记为「拖拽过」(click 据此放行,不误触发打开)。
        if (p && (Math.abs(p.x - gx) > 1 || Math.abs(p.y - gy) > 1)) dragMovedRef.current = true;
        posRef.current.set(d.id, { x: gx, y: gy });
        bumpDrag();
        return;
      }
      const p = panRef.current;
      if (!p) return;
      setTf((cur) => ({ ...cur, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
    };
    const onUp = () => {
      panRef.current = null;
      if (dragRef.current) {
        dragRef.current = null;
        setDragging(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [toView]);

  const zoomBy = (factor: number) =>
    setTf((cur) => ({
      tx: size.w / 2 - (size.w / 2 - cur.tx) * factor,
      ty: size.h / 2 - (size.h / 2 - cur.ty) * factor,
      scale: clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE),
    }));

  if (!snapshot || allNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">{t("graph.empty")}</p>
      </div>
    );
  }

  // 视口剔除:节点较多时(>CULL_THRESHOLD)不画屏外节点/边,降 SVG DOM 量。
  // 小图直接全画,省一次计算也免边缘 pop-in。pos 读 ref(渲染时已是最新)。
  const viewSet =
    renderIds.length > CULL_THRESHOLD
      ? visibleNodeIds(renderIds, posRef.current, tf, size, CULL_MARGIN)
      : null;
  const culledIds = viewSet ? renderIds.filter((id) => viewSet.has(id)) : renderIds;
  const edgeSet = viewSet ?? renderSet;

  const visibleEdges = filtered.edges.filter(
    (e) => edgeSet.has(e.from) && (e.to == null || edgeSet.has(e.to)),
  );
  // 边整体透明度:低倍率衰减,避免远观糊成黑团。
  const edgeOpacity = clamp(0.12 + tf.scale * 0.18, 0.12, 0.5);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  // 缩放阈值:超过则给所有节点显标签(否则只给高度数/悬停/当前)。
  const labelAll = tf.scale >= 1.05;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-base">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className={cn("h-full w-full", dragging ? "cursor-grabbing" : "")}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          {/* 微弱径向暗角,给图谱一点纵深(随主题 token 切换)。 */}
          <radialGradient id="graph-vignette" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="var(--color-base)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-crust)" stopOpacity="0.5" />
          </radialGradient>
          {/* 当前节点光晕。 */}
          <filter id="graph-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 背景层:平移面(mousedown 启动平移)+ 暗角。pointer-events 仅此层接收。 */}
        <rect
          x={0}
          y={0}
          width={size.w}
          height={size.h}
          fill="transparent"
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            panRef.current = { x: e.clientX, y: e.clientY, tx: tf.tx, ty: tf.ty };
          }}
        />
        <rect
          x={0}
          y={0}
          width={size.w}
          height={size.h}
          fill="url(#graph-vignette)"
          pointerEvents="none"
        />

        <g transform={`translate(${tf.tx},${tf.ty}) scale(${tf.scale})`}>
          {/* 边 */}
          <g opacity={edgeOpacity} pointerEvents="none">
            {visibleEdges.map((e, i) => {
              if (e.to == null) return null;
              const a = posRef.current.get(e.from);
              const b = posRef.current.get(e.to);
              if (!a || !b) return null;
              const isRel = e.kind === "relation";
              const hot = hover != null && (e.from === hover || e.to === hover);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  style={{
                    stroke: hot
                      ? "var(--color-blue)"
                      : isRel
                        ? "var(--color-mauve)"
                        : "var(--color-overlay)",
                  }}
                  strokeWidth={hot ? 1.6 : isRel ? 1.1 : 0.7}
                  strokeDasharray={isRel ? "4 3" : undefined}
                  opacity={hot ? 1 : undefined}
                />
              );
            })}
            {/* 悬空边(指向缺页):画成红色虚桩。 */}
            {visibleEdges
              .filter((e) => e.to == null && posRef.current.has(e.from))
              .map((e, i) => {
                const a = posRef.current.get(e.from)!;
                return (
                  <line
                    key={`unr-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={a.x + 10}
                    y2={a.y - 10}
                    style={{ stroke: "var(--color-red)" }}
                    strokeWidth={0.7}
                    strokeDasharray="2 2"
                  />
                );
              })}
          </g>

          {/* 节点 */}
          <g>
            {culledIds.map((id) => {
              const node = nodeById.get(id);
              const p = posRef.current.get(id);
              if (!node || !p) return null;
              const deg = degree.get(id) ?? 0;
              const r = 3 + Math.sqrt(deg) * 2.2;
              const isCurrent = id === currentId;
              const isHover = hover === id;
              const dim = neighbors != null && !neighbors.has(id);
              const showLabel =
                labelAll || deg >= 4 || isHover || isCurrent || id === filters.focusId;
              return (
                <g
                  key={id}
                  transform={`translate(${p.x},${p.y})`}
                  className="cursor-pointer"
                  opacity={dim ? 0.18 : 1}
                  style={{ transition: "opacity 120ms" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    dragRef.current = { id };
                    dragMovedRef.current = false;
                    setDragging(id);
                  }}
                  onClick={() => {
                    if (dragMovedRef.current) return;
                    actions.selectNote(node.path);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setFilters((f) => ({ ...f, focusId: id, hops: 1 }));
                  }}
                  onMouseEnter={() => setHover(id)}
                  onMouseLeave={() => setHover(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ x: e.clientX, y: e.clientY, node });
                  }}
                >
                  {(isCurrent || isHover) && (
                    <circle
                      r={r + 4}
                      fill={colorFor(node.type)}
                      opacity={0.22}
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    r={r}
                    filter={isCurrent ? "url(#graph-glow)" : undefined}
                    style={{
                      fill: colorFor(node.type),
                      stroke: isCurrent
                        ? "var(--color-blue)"
                        : "var(--color-base)",
                    }}
                    fillOpacity={isCurrent ? 1 : 0.9}
                    strokeWidth={isCurrent ? 2 : 1}
                  />
                  {showLabel && (
                    <text
                      x={r + 4}
                      y={3.5}
                      fontSize={10.5}
                      pointerEvents="none"
                      className="select-none"
                      style={{
                        fill: "var(--color-text)",
                        paintOrder: "stroke",
                        stroke: "var(--color-base)",
                        strokeWidth: 3,
                        strokeLinejoin: "round",
                      }}
                    >
                      {node.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* 统计 + 截断提示 */}
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-mantle/80 px-2 py-1 text-[11px] text-overlay backdrop-blur-sm">
        {t("graph.stats", { nodes: renderIds.length, edges: visibleEdges.length })}
        {filtered.nodeIds.size > MAX_NODES && (
          <span className="text-red">{t("graph.truncated", { n: MAX_NODES })}</span>
        )}
      </div>

      {/* 缩放 / 适应 控件 */}
      <div className="absolute bottom-2 left-2 flex flex-col gap-1">
        <button
          onClick={() => zoomBy(1.2)}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text backdrop-blur-sm"
          title={t("graph.zoomIn")}
        >
          <MagnifyingGlassPlus size={14} />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.2)}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text backdrop-blur-sm"
          title={t("graph.zoomOut")}
        >
          <MagnifyingGlassMinus size={14} />
        </button>
        <button
          onClick={fit}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text backdrop-blur-sm"
          title={t("graph.fit")}
        >
          <ArrowsOutSimple size={14} />
        </button>
      </div>

      {/* 过滤面板切换 */}
      <button
        onClick={() => setShowFilters((v) => !v)}
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 rounded px-2 py-1 text-[11px] backdrop-blur-sm",
          showFilters ? "bg-blue text-crust" : "bg-mantle/80 text-overlay hover:text-text",
        )}
      >
        <Funnel size={13} />
        {t("graph.filter")}
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
          t={t}
        />
      )}

      <ContextMenu
        items={menuItems}
        pos={menu ? { x: menu.x, y: menu.y } : null}
        onClose={() => setMenu(null)}
      />
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
  t,
}: {
  types: string[];
  tags: string[];
  filters: GraphFilters;
  currentId: number | null;
  onChange: (f: GraphFilters) => void;
  onReset: () => void;
  nodes: { id: number; type: string | null; tags: string[] }[];
  t: TFunc;
}) {
  const typeCount = (tp: string) =>
    nodes.filter((n) => (n.type ?? TYPELESS) === tp).length;
  const tagCount = (tp: string) => nodes.filter((n) => n.tags.includes(tp)).length;

  return (
    <div className="absolute right-2 top-9 max-h-[calc(100%-3rem)] w-52 overflow-y-auto rounded bg-mantle/95 p-2 text-[11px] shadow-lg ring-1 ring-crust backdrop-blur-sm">
      <Section title={t("graph.typeSection")}>
        {types.map((tp) => (
          <label key={tp} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
            <input
              type="checkbox"
              checked={filters.types.has(tp)}
              onChange={() => onChange({ ...filters, types: toggleSet(filters.types, tp) })}
              className="accent-[var(--color-blue)]"
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: colorFor(tp === TYPELESS ? null : tp) }}
            />
            <span className="flex-1 truncate">{tp === TYPELESS ? t("graph.typeless") : tp}</span>
            <span className="text-overlay">{typeCount(tp)}</span>
          </label>
        ))}
      </Section>

      {tags.length > 0 && (
        <Section title={t("graph.tagSection")}>
          {tags.map((tp) => (
            <label key={tp} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
              <input
                type="checkbox"
                checked={filters.tags.has(tp)}
                onChange={() => onChange({ ...filters, tags: toggleSet(filters.tags, tp) })}
                className="accent-[var(--color-teal)]"
              />
              <span className="truncate">#{tp}</span>
              <span className="text-overlay">{tagCount(tp)}</span>
            </label>
          ))}
        </Section>
      )}

      <Section title={t("graph.edgeSection")}>
        {(["wiki", "relation"] as EdgeKind[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
            <input
              type="checkbox"
              checked={filters.relations.has(k)}
              onChange={() => onChange({ ...filters, relations: toggleSet(filters.relations, k) })}
            />
            <span>{k === "wiki" ? t("graph.edgeWiki") : t("graph.edgeRelation")}</span>
          </label>
        ))}
      </Section>

      <label className="mt-1 flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
        <input
          type="checkbox"
          checked={filters.hideOrphans}
          onChange={() => onChange({ ...filters, hideOrphans: !filters.hideOrphans })}
        />
        <span>{t("graph.hideOrphans")}</span>
      </label>

      <div className="mt-2 border-t border-crust pt-2">
        {filters.focusId != null ? (
          <>
            <div className="mb-1 flex items-center justify-between text-subtext">
              <span className="flex items-center gap-1">
                <Target size={11} /> {t("graph.focusNeighborhood")}
              </span>
              <button onClick={() => onChange({ ...filters, focusId: null })} className="text-overlay hover:text-red">
                <X size={12} />
              </button>
            </div>
            <div className="flex items-center gap-1 text-overlay">
              <span>{t("graph.hops")}</span>
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
              <Target size={11} /> {t("graph.focusCurrent")}
            </span>
          </button>
        )}
      </div>

      <button
        onClick={onReset}
        className="mt-2 w-full rounded bg-surface px-1.5 py-1 text-overlay hover:bg-surface2"
      >
        {t("graph.resetFilter")}
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
