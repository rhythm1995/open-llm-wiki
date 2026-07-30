/**
 * GraphView —— 关系图谱(F-GRAPH 重构)。
 *
 * 架构:
 *   graph-filter  → 可见集
 *   graph-model   → path-stable / degree / topK / structureSig
 *   graph-layout-client → Worker FR(失败同步回退)
 *   graph-lod     → 低缩放网格聚类
 *   渲染:优先 sigma WebGL(GraphSigmaLayer);无 WebGL 或极小图 SVG 回退
 *
 * 交互(WebGL/SVG 对齐):过滤 / 悬停邻域压暗 / pin / 拖拽 / Shift 框选 /
 * 右键菜单 / 缩放 fit / LOD 簇飞入 / 悬空边 ghost。
 */
import {
  lazy,
  Suspense,
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
  PushPin,
  PushPinSlash,
} from "@phosphor-icons/react";
import type { NodeOut, VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import {
  applyGraphFilters,
  distinctStatuses,
  distinctTags,
  distinctTypes,
  NO_FILTER,
  STATUSLESS,
  TYPELESS,
  type EdgeKind,
  type GraphFilters,
} from "../lib/graph-filter";
import {
  BARNES_HUT_THRESHOLD,
  bbox,
  fitTransform,
  visibleNodeIds,
  type Pt,
} from "../lib/graph-layout";
import {
  countMissingPositions,
  suggestLayoutIterations,
} from "../lib/graph-layout-budget";
import { labelPriority, pickVisibleLabels } from "../lib/graph-label";
import {
  buildGraphModel,
  pinIdsToPaths,
  pinPathsToIds,
  structureSignature,
  topKByDegree,
  SVG_MAX_NODES,
  WEBGL_MAX_NODES,
} from "../lib/graph-model";
import {
  applyLod,
  buildLodRenderKeyMap,
  projectLodEdges,
} from "../lib/graph-lod";
import {
  createDefaultLayoutClient,
  type LayoutClient,
} from "../lib/graph-layout-client";
import {
  buildSigmaClusterAttrs,
  buildSigmaNodeAttrs,
  buildUnresolvedGhosts,
  canUseWebGL,
} from "../lib/graph-webgl";
import { nodeWikilink } from "../lib/wikilink";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import type { SigmaEdgeInput } from "./GraphSigmaLayer";

// sigma + graphology 体积大:懒加载独立 chunk,小图 SVG 路径不拉 WebGL。
const GraphSigmaLayer = lazy(() =>
  import("./GraphSigmaLayer").then((m) => ({ default: m.GraphSigmaLayer })),
);

interface Props {
  snapshot: VaultSnapshot | null;
  currentId: number | null;
  actions: VaultActions;
  t: TFunc;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const FIT_PAD = 60;
const CULL_THRESHOLD = 200;
const CULL_MARGIN = 80;
/**
 * WebGL 可用时优先走 sigma(拖拽/框选/LOD 已齐)。
 * 仅无 WebGL 时 SVG 回退;测试 jsdom 无 GL 自动 SVG。
 */
const WEBGL_MIN_NODES = 1;

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

function toggleSet<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
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

  const model = useMemo(
    () => buildGraphModel(allNodes, allEdges),
    [allNodes, allEdges],
  );

  const types = useMemo(() => distinctTypes(allNodes), [allNodes]);
  const tags = useMemo(() => distinctTags(allNodes), [allNodes]);
  const statuses = useMemo(() => distinctStatuses(allNodes), [allNodes]);

  const [filters, setFilters] = useState<GraphFilters>(() => ({
    ...NO_FILTER,
    types: new Set(types),
    relations: new Set<EdgeKind>(["wiki", "relation"]),
  }));
  const [showFilters, setShowFilters] = useState(true);
  const [tf, setTf] = useState({ tx: 0, ty: 0, scale: 1 });
  const [hover, setHover] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    node: NodeOut;
  } | null>(null);
  // pin 以 path 持久,跨 reindex id 变化仍稳。
  const pinPathsRef = useRef<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const boxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const [boxUi, setBoxUi] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    node: NodeOut;
  } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [zoomCmd, setZoomCmd] = useState({ token: 0, factor: 1 });
  const [flyTo, setFlyTo] = useState<{
    x: number;
    y: number;
    ratio: number;
    token: number;
  } | null>(null);
  const [cameraRatio, setCameraRatio] = useState(1);
  const [webglOk] = useState(() => canUseWebGL());

  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );
  const dragRef = useRef<{ id: number } | null>(null);
  const dragMovedRef = useRef(false);
  const posRef = useRef<Map<number, Pt>>(new Map());
  const layoutClientRef = useRef<LayoutClient | null>(null);
  const layoutGenRef = useRef(0);
  const [layoutTick, bumpLayout] = useReducer((x: number) => x + 1, 0);
  const [, bumpDrag] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    layoutClientRef.current = createDefaultLayoutClient();
    return () => {
      layoutClientRef.current?.dispose();
      layoutClientRef.current = null;
    };
  }, []);

  // 快照变了 → 用 path 重映射 pin ids。
  useEffect(() => {
    setPinned(pinPathsToIds(pinPathsRef.current, model.byPath));
  }, [model]);

  const filtered = useMemo(
    () => applyGraphFilters(allNodes, allEdges, filters),
    [allNodes, allEdges, filters],
  );

  const degree = useMemo(() => {
    const d = new Map<number, number>();
    for (const e of filtered.edges) {
      if (e.to == null) continue;
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [filtered.edges]);

  const preferWebgl =
    webglOk && filtered.nodeIds.size >= WEBGL_MIN_NODES;
  const maxNodes = preferWebgl ? WEBGL_MAX_NODES : SVG_MAX_NODES;

  const renderIds = useMemo(
    () => topKByDegree([...filtered.nodeIds], degree, maxNodes),
    [filtered.nodeIds, degree, maxNodes],
  );
  const renderSet = useMemo(() => new Set(renderIds), [renderIds]);

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

  const sig = useMemo(
    () => structureSignature(renderIds, filtered.edges),
    [renderIds, filtered.edges],
  );

  // 上一帧结构签名 / 尺寸,用于增量迭代预算。
  const prevLayoutRef = useRef<{ sig: string; w: number; h: number }>({
    sig: "",
    w: 0,
    h: 0,
  });

  // Worker / sync 布局(增量预算:结构未变或仅少量新节点时少迭代)。
  useEffect(() => {
    if (size.w === 0 || size.h === 0 || renderIds.length === 0) return;
    const client = layoutClientRef.current;
    if (!client) return;
    const gen = ++layoutGenRef.current;
    const springs = filtered.edges
      .filter((e) => e.to != null && renderSet.has(e.from) && renderSet.has(e.to))
      .map((e) => ({ from: e.from, to: e.to as number }));
    const prev = prevLayoutRef.current;
    const structureChanged = prev.sig !== sig;
    const sizeChanged = prev.w !== size.w || prev.h !== size.h;
    const newNodeCount = countMissingPositions(renderIds, posRef.current);
    const iterations = suggestLayoutIterations({
      n: renderIds.length,
      newNodeCount,
      structureChanged,
      sizeChanged,
    });
    void client
      .run({
        ids: renderIds,
        springs,
        positions: posRef.current,
        neighbors: adj,
        w: size.w,
        h: size.h,
        iterations,
        pinned,
        // 大图显式 Barnes-Hut;小图 exact(与默认 auto 一致,便于测试断言路径)。
        repulsion:
          renderIds.length >= BARNES_HUT_THRESHOLD ? "barnes-hut" : "exact",
      })
      .then((next) => {
        if (gen !== layoutGenRef.current) return;
        posRef.current = next;
        prevLayoutRef.current = { sig, w: size.w, h: size.h };
        bumpLayout();
      });
  }, [sig, size.w, size.h, renderIds, renderSet, adj, filtered.edges, pinned]);

  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (renderIds.length === 0 || size.w === 0 || size.h === 0) return;
    if (posRef.current.size === 0) return;
    const box = bbox(renderIds, posRef.current);
    setTf(fitTransform(box, size.w, size.h, FIT_PAD, MIN_SCALE, MAX_SCALE));
    setFitToken((n) => n + 1);
    didFitRef.current = true;
  }, [renderIds, size.w, size.h, layoutTick]);

  const fit = useCallback(() => {
    const box = bbox(renderIds, posRef.current);
    setTf(fitTransform(box, size.w, size.h, FIT_PAD, MIN_SCALE, MAX_SCALE));
    setFitToken((n) => n + 1);
  }, [renderIds, size.w, size.h]);

  const neighbors = useMemo(() => {
    if (hover == null) return null;
    const ns = new Set<number>([hover]);
    for (const n of adj.get(hover) ?? []) ns.add(n);
    return ns;
  }, [hover, adj]);

  const updatePinned = useCallback(
    (next: Set<number>) => {
      setPinned(next);
      pinPathsRef.current = pinIdsToPaths(next, model.byId);
    },
    [model.byId],
  );

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
    const isPinned = pinned.has(n.id);
    items.push(
      {
        label: isPinned ? t("graph.menu.unpin") : t("graph.menu.pin"),
        icon: isPinned ? <PushPinSlash size={13} /> : <PushPin size={13} />,
        onClick: () => {
          const next = new Set(pinned);
          if (next.has(n.id)) next.delete(n.id);
          else next.add(n.id);
          updatePinned(next);
        },
      },
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
        onClick: () =>
          setFilters((f) => ({ ...f, types: toggleSet(f.types, tp) })),
      },
    );
    return items;
  }, [menu, filters, pinned, t, actions, updatePinned]);

  const toView = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  const tfRef = useRef(tf);
  tfRef.current = tf;

  // SVG 滚轮 / 拖拽 / 框选。
  useEffect(() => {
    if (preferWebgl) return;
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = toView(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTf((cur) => {
        const scale = clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE);
        const r = scale / cur.scale;
        return {
          tx: v.x - (v.x - cur.tx) * r,
          ty: v.y - (v.y - cur.ty) * r,
          scale,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toView, preferWebgl]);

  useEffect(() => {
    if (preferWebgl) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) {
        const v = toView(e.clientX, e.clientY);
        const { tx, ty, scale } = tfRef.current;
        const gx = (v.x - tx) / scale;
        const gy = (v.y - ty) / scale;
        const p = posRef.current.get(d.id);
        if (p && (Math.abs(p.x - gx) > 1 || Math.abs(p.y - gy) > 1))
          dragMovedRef.current = true;
        posRef.current.set(d.id, { x: gx, y: gy });
        bumpDrag();
        return;
      }
      const box = boxRef.current;
      if (box) {
        const v = toView(e.clientX, e.clientY);
        box.x1 = v.x;
        box.y1 = v.y;
        setBoxUi({
          x: Math.min(box.x0, box.x1),
          y: Math.min(box.y0, box.y1),
          w: Math.abs(box.x1 - box.x0),
          h: Math.abs(box.y1 - box.y0),
        });
        return;
      }
      const p = panRef.current;
      if (!p) return;
      setTf((cur) => ({
        ...cur,
        tx: p.tx + (e.clientX - p.x),
        ty: p.ty + (e.clientY - p.y),
      }));
    };
    const onUp = () => {
      panRef.current = null;
      if (dragRef.current) {
        const id = dragRef.current.id;
        if (dragMovedRef.current) {
          const next = new Set(pinned);
          next.add(id);
          updatePinned(next);
        }
        dragRef.current = null;
        setDragging(null);
      }
      if (boxRef.current) {
        const box = boxRef.current;
        boxRef.current = null;
        setBoxUi(null);
        const { tx, ty, scale } = tfRef.current;
        const x0 = Math.min(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1);
        const x1 = Math.max(box.x0, box.x1);
        const y1 = Math.max(box.y0, box.y1);
        const hit = new Set<number>();
        for (const [id, p] of posRef.current) {
          const sx = p.x * scale + tx;
          const sy = p.y * scale + ty;
          if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) hit.add(id);
        }
        setSelected(hit);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [toView, preferWebgl, pinned, updatePinned]);

  const zoomBy = (factor: number) => {
    if (preferWebgl) {
      setZoomCmd((c) => ({ token: c.token + 1, factor }));
      return;
    }
    setTf((cur) => ({
      tx: size.w / 2 - (size.w / 2 - cur.tx) * factor,
      ty: size.h / 2 - (size.h / 2 - cur.ty) * factor,
      scale: clamp(cur.scale * factor, MIN_SCALE, MAX_SCALE),
    }));
  };

  // —— WebGL 数据 ——
  // sigma camera ratio: 越小越放大;近似 1/scale 映射到 LOD。
  const lodScale = preferWebgl ? 1 / Math.max(cameraRatio, 0.05) : tf.scale;
  const lod = useMemo(() => {
    if (!preferWebgl) {
      return { active: false as const, clusters: [], leafIds: [...renderIds] };
    }
    return applyLod(renderIds, posRef.current, lodScale, {
      minNodes: 400,
      maxScale: 0.55,
    });
    // layout bump 后 pos 变,需要重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferWebgl, renderIds, lodScale, layoutTick]);

  const sigmaNodes = useMemo(() => {
    if (!preferWebgl) return new Map();
    const meta = new Map(
      renderIds.map((id) => {
        const n = model.byId.get(id);
        return [
          id,
          {
            title: n?.title ?? String(id),
            type: n?.type ?? null,
            degree: degree.get(id) ?? 0,
          },
        ] as const;
      }),
    );
    const leaves = lod.active ? lod.leafIds : renderIds;
    // 标签避让:用当前相机近似(ratio 越小越放大 → scale 越大)。
    const approxScale = lodScale;
    const labelCands = leaves.map((id) => {
      const p = posRef.current.get(id) ?? { x: 0, y: 0 };
      const n = model.byId.get(id);
      return {
        id,
        x: p.x,
        y: p.y,
        title: n?.title ?? "",
        priority: labelPriority({
          degree: degree.get(id) ?? 0,
          isCurrent: id === currentId,
          isHover: id === hover,
          isSelected: selected.has(id),
          isTextHit: filtered.textHits.has(id),
          isPinned: pinned.has(id),
          isFocus: id === filters.focusId,
        }),
      };
    });
    const labelAllow = pickVisibleLabels(labelCands, {
      scale: approxScale,
      tx: size.w / 2,
      ty: size.h / 2,
      maxLabels: approxScale < 0.6 ? 40 : approxScale < 1 ? 80 : 200,
    });
    const nodeAttrs = buildSigmaNodeAttrs(leaves, posRef.current, meta, {
      currentId,
      hoverId: hover,
      selected,
      textHits: filtered.textHits,
      pinned,
      focusId: filters.focusId,
      neighborFocus: neighbors,
      forceLabelAll: lodScale >= 1.05,
      labelAllow,
    });
    if (lod.active) {
      for (const [k, v] of buildSigmaClusterAttrs(lod.clusters)) {
        nodeAttrs.set(k, v);
      }
    } else {
      // 非 LOD:悬空边 ghost 桩。
      const ghosts = buildUnresolvedGhosts(
        filtered.edges,
        posRef.current,
        new Set(leaves),
      );
      for (const [k, v] of ghosts.nodes) nodeAttrs.set(k, v);
    }
    return nodeAttrs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    preferWebgl,
    renderIds,
    model,
    degree,
    currentId,
    hover,
    selected,
    pinned,
    neighbors,
    filtered.textHits,
    filtered.edges,
    filters.focusId,
    lod,
    lodScale,
    layoutTick,
    size.w,
    size.h,
  ]);

  const sigmaEdges: SigmaEdgeInput[] = useMemo(() => {
    if (!preferWebgl) return [];
    const out: SigmaEdgeInput[] = [];
    if (lod.active) {
      const keyMap = buildLodRenderKeyMap(lod);
      for (const e of projectLodEdges(filtered.edges, keyMap)) {
        out.push({
          key: e.key,
          source: e.source,
          target: e.target,
          kind: e.kind,
          weight: e.weight,
          hot: false,
        });
      }
      return out;
    }
    const leafSet = new Set(renderIds);
    let i = 0;
    for (const e of filtered.edges) {
      if (e.to == null) continue;
      if (!leafSet.has(e.from) || !leafSet.has(e.to)) continue;
      const hot = hover != null && (e.from === hover || e.to === hover);
      out.push({
        key: `e${i++}`,
        source: String(e.from),
        target: String(e.to),
        kind: e.kind,
        hot,
      });
    }
    // 悬空边 → ghost。
    const ghosts = buildUnresolvedGhosts(
      filtered.edges,
      posRef.current,
      leafSet,
    );
    for (const ge of ghosts.edges) {
      out.push({
        key: ge.key,
        source: ge.source,
        target: ge.target,
        kind: "unresolved",
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferWebgl, filtered.edges, lod, renderIds, hover, layoutTick]);

  if (!snapshot || allNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">{t("graph.empty")}</p>
      </div>
    );
  }

  const viewSet =
    !preferWebgl && renderIds.length > CULL_THRESHOLD
      ? visibleNodeIds(renderIds, posRef.current, tf, size, CULL_MARGIN)
      : null;
  const culledIds = viewSet
    ? renderIds.filter((id) => viewSet.has(id))
    : renderIds;
  const edgeSet = viewSet ?? renderSet;
  const visibleEdges = filtered.edges.filter(
    (e) => edgeSet.has(e.from) && (e.to == null || edgeSet.has(e.to)),
  );
  const edgeOpacity = clamp(0.12 + tf.scale * 0.18, 0.12, 0.5);
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  // SVG 标签避让(与 WebGL 同源)。
  const svgLabelAllow = (() => {
    if (preferWebgl) return null as Set<number> | null;
    const cands = culledIds.map((id) => {
      const p = posRef.current.get(id) ?? { x: 0, y: 0 };
      const n = nodeById.get(id);
      return {
        id,
        x: p.x,
        y: p.y,
        title: n?.title ?? "",
        priority: labelPriority({
          degree: degree.get(id) ?? 0,
          isCurrent: id === currentId,
          isHover: id === hover,
          isSelected: selected.has(id),
          isTextHit: filtered.textHits.has(id),
          isPinned: pinned.has(id),
          isFocus: id === filters.focusId,
        }),
      };
    });
    return pickVisibleLabels(cands, {
      scale: tf.scale,
      tx: tf.tx,
      ty: tf.ty,
      maxLabels: tf.scale < 0.6 ? 40 : tf.scale < 1 ? 80 : 200,
    });
  })();

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-base">
      {preferWebgl && size.w > 0 && size.h > 0 ? (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[12px] text-overlay">
              WebGL…
            </div>
          }
        >
          <GraphSigmaLayer
            nodes={sigmaNodes}
            edges={sigmaEdges}
            structureKey={
              sig + (lod.active ? `|lod:${lod.clusters.length}` : "")
            }
            width={size.w}
            height={size.h}
            fitToken={fitToken}
            zoomToken={zoomCmd.token}
            zoomFactor={zoomCmd.factor}
            flyTo={flyTo}
            onCameraRatio={setCameraRatio}
            onNodeClick={(nodeId, isCluster, memberIds, center) => {
              if (isCluster && memberIds && memberIds.length > 0) {
                // 飞入簇中心放大 → LOD 退出后展开成员。
                if (center) {
                  setFlyTo((prev) => ({
                    x: center.x,
                    y: center.y,
                    ratio: Math.max(0.12, cameraRatio * 0.35),
                    token: (prev?.token ?? 0) + 1,
                  }));
                }
                // 同时聚焦一员邻域,便于立刻导航。
                setFilters((f) => ({
                  ...f,
                  focusId: memberIds[0],
                  hops: 2,
                }));
                return;
              }
              const n = model.byId.get(nodeId);
              if (n) actions.selectNote(n.path);
            }}
            onNodeDoubleClick={(nodeId) =>
              setFilters((f) => ({ ...f, focusId: nodeId, hops: 1 }))
            }
            onNodeRightClick={(nodeId, x, y) => {
              const n = nodeById.get(nodeId);
              if (n) setMenu({ x, y, node: n });
            }}
            onNodeEnter={(nodeId, x, y) => {
              const n = nodeById.get(nodeId);
              setHover(nodeId);
              if (n) setPreview({ x, y, node: n });
            }}
            onNodeLeave={() => {
              setHover(null);
              setPreview(null);
            }}
            onBackgroundClick={() => setSelected(new Set())}
            onNodeDragEnd={(nodeId, x, y, moved) => {
              posRef.current.set(nodeId, { x, y });
              if (moved) {
                const next = new Set(pinned);
                next.add(nodeId);
                updatePinned(next);
              }
              bumpLayout();
            }}
            onBoxSelect={(ids) => setSelected(new Set(ids))}
          />
        </Suspense>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className={cn("h-full w-full", dragging ? "cursor-grabbing" : "")}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <radialGradient id="graph-vignette" cx="50%" cy="50%" r="75%">
              <stop offset="60%" stopColor="var(--color-base)" stopOpacity="0" />
              <stop
                offset="100%"
                stopColor="var(--color-crust)"
                stopOpacity="0.5"
              />
            </radialGradient>
            <filter id="graph-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            x={0}
            y={0}
            width={size.w}
            height={size.h}
            fill="transparent"
            className="cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              if (e.shiftKey) {
                const v = toView(e.clientX, e.clientY);
                boxRef.current = { x0: v.x, y0: v.y, x1: v.x, y1: v.y };
                setBoxUi({ x: v.x, y: v.y, w: 0, h: 0 });
                return;
              }
              setSelected(new Set());
              panRef.current = {
                x: e.clientX,
                y: e.clientY,
                tx: tf.tx,
                ty: tf.ty,
              };
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
            <g>
              {culledIds.map((id) => {
                const node = nodeById.get(id);
                const p = posRef.current.get(id);
                if (!node || !p) return null;
                const deg = degree.get(id) ?? 0;
                const r = 3 + Math.sqrt(deg) * 2.2;
                const isCurrent = id === currentId;
                const isHover = hover === id;
                const isSel = selected.has(id);
                const isTextHit = filtered.textHits.has(id);
                const isPin = pinned.has(id);
                const dim = neighbors != null && !neighbors.has(id);
                const showLabel =
                  isHover ||
                  isCurrent ||
                  isSel ||
                  isTextHit ||
                  id === filters.focusId ||
                  (svgLabelAllow?.has(id) ?? deg >= 4);
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
                    onMouseEnter={(e) => {
                      setHover(id);
                      setPreview({ x: e.clientX, y: e.clientY, node });
                    }}
                    onMouseMove={(e) => {
                      if (hover === id)
                        setPreview({ x: e.clientX, y: e.clientY, node });
                    }}
                    onMouseLeave={() => {
                      setHover(null);
                      setPreview(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({ x: e.clientX, y: e.clientY, node });
                    }}
                  >
                    {(isCurrent || isHover || isSel || isTextHit) && (
                      <circle
                        r={r + 4}
                        fill={
                          isTextHit
                            ? "var(--color-yellow)"
                            : isSel
                              ? "var(--color-blue)"
                              : colorFor(node.type)
                        }
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
                          : isTextHit
                            ? "var(--color-yellow)"
                            : isSel
                              ? "var(--color-teal)"
                              : isPin
                                ? "var(--color-mauve)"
                                : "var(--color-base)",
                      }}
                      fillOpacity={isCurrent ? 1 : 0.9}
                      strokeWidth={
                        isCurrent || isTextHit || isSel || isPin ? 2 : 1
                      }
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
      )}

      <div className="pointer-events-none absolute left-2 top-2 rounded bg-mantle/80 px-2 py-1 text-[11px] text-overlay backdrop-blur-sm">
        {t("graph.stats", {
          nodes: renderIds.length,
          edges: preferWebgl ? sigmaEdges.length : visibleEdges.length,
        })}
        {filtered.nodeIds.size > maxNodes && (
          <span className="text-red">
            {t("graph.truncated", { n: maxNodes })}
          </span>
        )}
        {preferWebgl && (
          <span className="ml-1 text-subtext">WebGL</span>
        )}
        {lod.active && (
          <span className="ml-1 text-subtext">LOD</span>
        )}
      </div>

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

      <button
        onClick={() => setShowFilters((v) => !v)}
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 rounded px-2 py-1 text-[11px] backdrop-blur-sm",
          showFilters
            ? "bg-blue text-crust"
            : "bg-mantle/80 text-overlay hover:text-text",
        )}
      >
        <Funnel size={13} />
        {t("graph.filter")}
      </button>

      {boxUi && boxUi.w + boxUi.h > 0 && (
        <div
          className="pointer-events-none absolute border border-blue/80 bg-blue/10"
          style={{
            left: boxUi.x,
            top: boxUi.y,
            width: boxUi.w,
            height: boxUi.h,
          }}
        />
      )}

      {preview && (
        <div
          className="pointer-events-none fixed z-30 max-w-xs rounded border border-crust bg-mantle/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur-sm"
          style={{ left: preview.x + 12, top: preview.y + 12 }}
        >
          <div className="font-medium text-text">{preview.node.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-1 text-overlay">
            {preview.node.type && (
              <span className="rounded bg-surface px-1">
                {preview.node.type}
              </span>
            )}
            {preview.node.status && (
              <span className="rounded bg-surface px-1">
                {preview.node.status}
              </span>
            )}
            {preview.node.tags.slice(0, 4).map((tg) => (
              <span key={tg} className="rounded bg-surface px-1">
                #{tg}
              </span>
            ))}
          </div>
          {preview.node.preview && (
            <p className="mt-1 line-clamp-3 text-subtext">
              {preview.node.preview}
            </p>
          )}
        </div>
      )}

      {showFilters && (
        <FilterPanel
          types={types}
          tags={tags}
          statuses={statuses}
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
  statuses,
  filters,
  currentId,
  onChange,
  onReset,
  nodes,
  t,
}: {
  types: string[];
  tags: string[];
  statuses: string[];
  filters: GraphFilters;
  currentId: number | null;
  onChange: (f: GraphFilters) => void;
  onReset: () => void;
  nodes: {
    id: number;
    type: string | null;
    tags: string[];
    status: string | null;
  }[];
  t: TFunc;
}) {
  const typeCount = (tp: string) =>
    nodes.filter((n) => (n.type ?? TYPELESS) === tp).length;
  const tagCount = (tp: string) => nodes.filter((n) => n.tags.includes(tp)).length;
  const statusCount = (st: string) =>
    nodes.filter((n) => (n.status ?? STATUSLESS) === st).length;

  return (
    <div className="absolute right-2 top-9 max-h-[calc(100%-3rem)] w-52 overflow-y-auto rounded bg-mantle/95 p-2 text-[11px] shadow-lg ring-1 ring-crust backdrop-blur-sm">
      <Section title={t("graph.searchSection")}>
        <input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder={t("graph.searchPlaceholder")}
          className="mb-1 w-full rounded bg-surface px-1.5 py-1 text-[11px] text-text outline-none placeholder:text-overlay"
        />
      </Section>

      <Section title={t("graph.typeSection")}>
        {types.map((tp) => (
          <label
            key={tp}
            className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext"
          >
            <input
              type="checkbox"
              checked={filters.types.has(tp)}
              onChange={() =>
                onChange({ ...filters, types: toggleSet(filters.types, tp) })
              }
              className="accent-[var(--color-blue)]"
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: colorFor(tp === TYPELESS ? null : tp) }}
            />
            <span className="flex-1 truncate">
              {tp === TYPELESS ? t("graph.typeless") : tp}
            </span>
            <span className="text-overlay">{typeCount(tp)}</span>
          </label>
        ))}
      </Section>

      {tags.length > 0 && (
        <Section title={t("graph.tagSection")}>
          {tags.map((tp) => (
            <label
              key={tp}
              className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext"
            >
              <input
                type="checkbox"
                checked={filters.tags.has(tp)}
                onChange={() =>
                  onChange({ ...filters, tags: toggleSet(filters.tags, tp) })
                }
                className="accent-[var(--color-teal)]"
              />
              <span className="truncate">#{tp}</span>
              <span className="text-overlay">{tagCount(tp)}</span>
            </label>
          ))}
        </Section>
      )}

      {statuses.length > 0 && (
        <Section title={t("graph.statusSection")}>
          {statuses.map((st) => (
            <label
              key={st}
              className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext"
            >
              <input
                type="checkbox"
                checked={filters.statuses.has(st)}
                onChange={() =>
                  onChange({
                    ...filters,
                    statuses: toggleSet(filters.statuses, st),
                  })
                }
                className="accent-[var(--color-yellow)]"
              />
              <span className="flex-1 truncate">
                {st === STATUSLESS ? t("graph.statusless") : st}
              </span>
              <span className="text-overlay">{statusCount(st)}</span>
            </label>
          ))}
        </Section>
      )}

      <Section title={t("graph.edgeSection")}>
        {(["wiki", "relation"] as EdgeKind[]).map((k) => (
          <label
            key={k}
            className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext"
          >
            <input
              type="checkbox"
              checked={filters.relations.has(k)}
              onChange={() =>
                onChange({
                  ...filters,
                  relations: toggleSet(filters.relations, k),
                })
              }
            />
            <span>
              {k === "wiki" ? t("graph.edgeWiki") : t("graph.edgeRelation")}
            </span>
          </label>
        ))}
      </Section>

      <label className="mt-1 flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
        <input
          type="checkbox"
          checked={filters.hideOrphans}
          onChange={() =>
            onChange({ ...filters, hideOrphans: !filters.hideOrphans })
          }
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
              <button
                onClick={() => onChange({ ...filters, focusId: null })}
                className="text-overlay hover:text-red"
              >
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
                onChange={(e) =>
                  onChange({ ...filters, hops: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--color-blue)]"
              />
              <span className="w-4 text-right text-subtext">{filters.hops}</span>
            </div>
          </>
        ) : (
          <button
            disabled={currentId == null}
            onClick={() =>
              currentId != null &&
              onChange({ ...filters, focusId: currentId, hops: 1 })
            }
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
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-overlay">
        {title}
      </div>
      {children}
    </div>
  );
}
