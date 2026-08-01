/**
 * GraphView —— 关系图谱(F-GRAPH,canvas-2D / react-force-graph-2d 重构)。
 *
 * 架构:
 *   graph-filter  → 可见集
 *   graph-model   → path-stable / degree / topK / structureSig
 *   d3-force      → 布局坐标(react-force-graph-2d 内部持有,替代旧 FR Worker)
 *   GraphForceLayer → canvas 绘制层(节点状态环 / 标签芯片 / 簇色 / 悬停邻域高亮)
 *
 * 数据流(翻转后):GraphView 构建 {nodes,links}(稳定身份,就地改字段)交给 rfg;
 * d3-force 在层内排布坐标。结构变化才增删节点,状态/悬停变化就地改字段——
 * rfg 按 id 复用节点对象,x/y/fx/fy 得以保留。
 *
 * 交互:过滤 / 悬停邻域压暗(层内) / pin(钉→fx/fy) / 拖拽→自动钉 /
 * Shift 框选 / 右键菜单 / 缩放 fit / 焦点飞入 / 悬空边 ghost。
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
  ArrowsClockwise,
  Graph,
  Path as PathIcon,
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
import { type ForceParams, type Pt } from "../lib/graph-layout";
import { orphanIds, shortestPath, topHubs, type Hub } from "../lib/graph-health";
import {
  layoutByTimeline,
  layoutByTypeLayer,
  resolveNodeTimeMs,
  TYPELESS_LABEL,
  type LayoutMode,
} from "../lib/graph-modes";
import {
  buildGraphModel,
  pinIdsToPaths,
  pinPathsToIds,
  structureSignature,
  topKByDegree,
  WEBGL_MAX_NODES,
  type GraphNode,
} from "../lib/graph-model";
import {
  parseLayoutJson,
  serializeLayoutJson,
  serializePositions,
} from "../lib/graph-layout-store";
import { ipc } from "../lib/ipc";
import {
  assignClusterColors,
  nodeClusterKey,
  topClusters,
  type ClusterColor,
  type ClusterMode,
} from "../lib/graph-cluster";
import { isDarkTheme } from "../lib/graph-style";
import { nodeWikilink } from "../lib/wikilink";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import type { GraphLinkInput, GraphNodeInput } from "./GraphForceLayer";

// react-force-graph-2d 体积大:懒加载独立 chunk。
const GraphForceLayer = lazy(() =>
  import("./GraphForceLayer").then((m) => ({ default: m.GraphForceLayer })),
);

interface Props {
  snapshot: VaultSnapshot | null;
  currentId: number | null;
  actions: VaultActions;
  /** vault 根路径(落盘布局快照用)。 */
  root: string;
  /** 图谱力参数(6A2,来自应用设置)。 */
  forces: ForceParams;
  t: TFunc;
}

/** force 模式 tick 上限(到期停摆省电;autoPauseRedraw=false 仍持续重绘)。 */
const COOLDOWN_TICKS = 300;

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

export function GraphView({ snapshot, currentId, actions, root, forces, t }: Props) {
  const allNodes = snapshot?.nodes ?? [];
  const allEdges = snapshot?.edges ?? [];

  const model = useMemo(
    () => buildGraphModel(allNodes, allEdges),
    [allNodes, allEdges],
  );

  const types = useMemo(() => distinctTypes(allNodes), [allNodes]);
  const tags = useMemo(() => distinctTags(allNodes), [allNodes]);
  const statuses = useMemo(() => distinctStatuses(allNodes), [allNodes]);

  // 6B4:全库孤儿 / 枢纽(基于完整 model,不受过滤器影响)。
  const orphanNodes = useMemo(
    () =>
      orphanIds(model, "both")
        .map((id) => model.byId.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null),
    [model],
  );
  const hubs = useMemo(() => topHubs(model, 50), [model]);

  const [filters, setFilters] = useState<GraphFilters>(() => ({
    ...NO_FILTER,
    types: new Set(types),
    relations: new Set<EdgeKind>(["wiki", "relation"]),
  }));
  const [showFilters, setShowFilters] = useState(true);
  // 6B4:图健康面板(Orphans / Hubs),默认关。
  const [showHealth, setShowHealth] = useState(false);
  const [healthMode, setHealthMode] = useState<"orphans" | "hubs">("orphans");
  // 6A5:最短路径。pathFrom 由右键菜单设定;pathResult 为 id 序列 / 不可达 / 未计算。
  const [pathFrom, setPathFrom] = useState<number | null>(null);
  const [pathResult, setPathResult] = useState<
    { ids: number[] } | "unreachable" | null
  >(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [clusterMode, setClusterMode] = useState<ClusterMode>("none");
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    node: NodeOut;
  } | null>(null);
  // pin 以 path 持久,跨 reindex id 变化仍稳。
  const pinPathsRef = useRef<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    node: NodeOut;
  } | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [zoomCmd, setZoomCmd] = useState({ token: 0, factor: 1 });
  const [flyTo, setFlyTo] = useState<{
    x: number;
    y: number;
    zoom: number;
    token: number;
  } | null>(null);
  // Recalculate(6A2):强制重排令牌;递增 = 重施力 + reheat。
  const [recalcToken, bumpRecalc] = useReducer((x: number) => x + 1, 0);
  const [forcesToken, setForcesToken] = useState(0);
  // 布局稳定回调驱动的落盘节拍(替代旧 layoutTick)。
  const [positionsTick, bumpPositions] = useReducer((x: number) => x + 1, 0);
  // 磁盘布局是否已尝试加载(暖启动种子就绪)。
  const [layoutReady, setLayoutReady] = useState(false);

  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();

  // ── 稳定身份图谱数据(refs,就地改字段) ──────────────────────────────
  const nodesRef = useRef<GraphNodeInput[]>([]);
  const nodesByIdRef = useRef<Map<number, GraphNodeInput>>(new Map());
  const linksRef = useRef<GraphLinkInput[]>([]);
  // 暖启动 / 最新稳定坐标(id→Pt)。暖启动为落盘种子;positionsRef 由层回写供落盘。
  const warmPositionsRef = useRef<Map<number, Pt>>(new Map());
  const positionsRef = useRef<Map<number, Pt>>(new Map());

  const nodeByIdFull = useMemo(
    () => new Map<number, NodeOut>(allNodes.map((n) => [n.id, n])),
    [allNodes],
  );

  // ── 6A1 坐标落盘 ────────────────────────────────────────────────────────
  // 读:root 变化时读一次 `.openobsidian/graph-layout.json`,合流进 warmPositionsRef。
  // loadedRef 在完成前为 false,阻止 save effect 把空布局写回覆盖。
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 切换 vault:清空上一 vault 的图数据 / 坐标种子,新 vault 从空白起步
    // (warmPositions 仅在 stored 非空时覆盖,不重置会泄漏上一 vault 的坐标)。
    nodesRef.current = [];
    nodesByIdRef.current = new Map();
    linksRef.current = [];
    warmPositionsRef.current = new Map();
    positionsRef.current = new Map();
    if (!root) {
      loadedRef.current = false;
      setLayoutReady(false);
      return;
    }
    loadedRef.current = false;
    setLayoutReady(false);
    let cancelled = false;
    void ipc
      .readGraphLayout(root)
      .then((json) => {
        if (cancelled) return;
        if (json) {
          const pathToId = (p: string) => model.byPath.get(p)?.id ?? null;
          const stored = parseLayoutJson(json, pathToId);
          if (stored.size > 0) warmPositionsRef.current = stored;
        }
        loadedRef.current = true;
        setLayoutReady(true);
      })
      .catch(() => {
        loadedRef.current = true;
        setLayoutReady(true);
      });
    return () => {
      cancelled = true;
    };
    // 只在 root 变化时读一次;model.byPath 取读时刻的(快照内 path 稳定)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  // 写:布局稳定后(600ms 静默)落盘。loadedRef 未就绪时跳过,避免空覆盖。
  useEffect(() => {
    if (!root || !loadedRef.current) return;
    if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const idToPath = (id: number) => model.byId.get(id)?.path ?? null;
      const json = serializeLayoutJson(
        serializePositions(positionsRef.current, idToPath, {
          w: size.w,
          h: size.h,
        }),
      );
      if (json != null) void ipc.saveGraphLayout(root, json).catch(() => {});
    }, 600);
    return () => {
      if (saveTimerRef.current != null) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsTick, root]);

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

  const renderIds = useMemo(
    () => topKByDegree([...filtered.nodeIds], degree, WEBGL_MAX_NODES),
    [filtered.nodeIds, degree],
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

  // 层内悬停压暗需要的无向邻接表(Set 形态)。
  const adjSet = useMemo(() => {
    const m = new Map<number, ReadonlySet<number>>();
    for (const [k, arr] of adj) m.set(k, new Set(arr));
    return m;
  }, [adj]);

  const sig = useMemo(
    () => structureSignature(renderIds, filtered.edges),
    [renderIds, filtered.edges],
  );

  const forcesKey = useMemo(() => JSON.stringify(forces), [forces]);

  // ── 结构构建(稳定身份 graphData) ──────────────────────────────────────
  // 增删/刷新节点元数据、种子坐标、冻结布局、边 + 悬空 ghost。
  // 返回的 graphData 包裹对象只在结构相关依赖变化时换身份 → rfg 视为结构变化,
  // 层内重施力 + (force 模式)reheat;状态/悬停变化不触发,避免无谓重排。
  const graphData = useMemo(() => {
    const byId = nodesByIdRef.current;
    const arr = nodesRef.current;
    const warm = warmPositionsRef.current;
    const want = renderSet;

    // 1) 丢弃被过滤掉的实节点 + 全部 ghost(ghost 每轮重建)。
    for (let i = arr.length - 1; i >= 0; i--) {
      const n = arr[i];
      if (n.isGhost || n.isMissing || !want.has(n.id)) {
        arr.splice(i, 1);
        byId.delete(n.id);
      }
    }

    // 2) 增删/刷新实节点元数据 + 种子坐标(force 模式不动 fx/fy)。
    for (const id of renderIds) {
      const g = model.byId.get(id);
      const full = nodeByIdFull.get(id);
      const deg = degree.get(id) ?? 0;
      const n = byId.get(id);
      const w = warm.get(id);
      if (!n) {
        const node: GraphNodeInput = {
          id,
          path: g?.path ?? "",
          title: g?.title ?? String(id),
          type: g?.type ?? null,
          tags: full?.tags ?? [],
          status: full?.status ?? null,
          degree: deg,
          x: w?.x,
          y: w?.y,
        };
        byId.set(id, node);
        arr.push(node);
      } else {
        n.path = g?.path ?? n.path;
        n.title = g?.title ?? n.title;
        n.type = g?.type ?? null;
        n.tags = full?.tags ?? n.tags;
        n.status = full?.status ?? n.status;
        n.degree = deg;
        if (n.x == null && w?.x != null) {
          n.x = w.x;
          n.y = w.y;
        }
      }
    }

    // 3) 冻结布局(type-layer / timeline):确定性坐标 + fx/fy。
    if (layoutMode === "type-layer" || layoutMode === "timeline") {
      const pos = new Map<number, Pt>();
      for (const id of renderIds) {
        const n = byId.get(id)!;
        pos.set(id, { x: n.x ?? 0, y: n.y ?? 0 });
      }
      if (layoutMode === "type-layer") {
        const typeOf = (id: number) => model.byId.get(id)?.type ?? null;
        layoutByTypeLayer(renderIds, typeOf, pos, {
          w: size.w,
          h: size.h,
          typeOrder: [...types, TYPELESS_LABEL],
        });
      } else {
        const timeOf = (id: number) => {
          const f = nodeByIdFull.get(id);
          return resolveNodeTimeMs({
            created: f?.created ?? null,
            modified: f?.modified,
          });
        };
        layoutByTimeline(renderIds, timeOf, pos, { w: size.w, h: size.h });
      }
      for (const id of renderIds) {
        const n = byId.get(id)!;
        const p = pos.get(id)!;
        n.x = p.x;
        n.y = p.y;
        n.fx = p.x;
        n.fy = p.y;
      }
    }

    // 4) 边 + 悬空 ghost(ghost 钉在源节点旁,红色虚线环)。
    const links = linksRef.current;
    links.length = 0;
    let gi = 0;
    for (const e of filtered.edges) {
      if (e.to != null) {
        if (want.has(e.from) && want.has(e.to)) {
          links.push({ source: e.from, target: e.to, kind: e.kind });
        }
      } else if (want.has(e.from)) {
        const src = byId.get(e.from);
        const gid = -(e.from * 100003 + gi + 1);
        gi++;
        const sx = (src?.x ?? 0) + 14;
        const sy = (src?.y ?? 0) - 14;
        const ghost: GraphNodeInput = {
          id: gid,
          path: "",
          title: "",
          type: null,
          degree: 0,
          isMissing: true,
          x: sx,
          y: sy,
          fx: sx,
          fy: sy,
        };
        arr.push(ghost);
        byId.set(gid, ghost);
        links.push({ source: e.from, target: gid, kind: "unresolved" });
      }
    }

    return { nodes: arr, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sig,
    layoutMode,
    layoutReady,
    size.w,
    size.h,
    types,
    nodeByIdFull,
    renderIds,
    renderSet,
    filtered.edges,
    degree,
    model,
  ]);

  // ── fx/fy(force 模式钉住):就地改字段,不换 graphData 身份 → 不重排。 ──
  useMemo(() => {
    if (layoutMode !== "force") return;
    const byId = nodesByIdRef.current;
    for (const id of renderIds) {
      const n = byId.get(id);
      if (!n) continue;
      if (pinned.has(id)) {
        if (n.fx == null) {
          n.fx = n.x ?? 0;
          n.fy = n.y ?? 0;
        }
      } else {
        n.fx = undefined;
        n.fy = undefined;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned, layoutMode, renderIds]);

  // ── 每帧视觉状态标志(就地改字段;autoPauseRedraw=false 保证每帧重绘可见)。 ──
  useMemo(() => {
    const byId = nodesByIdRef.current;
    for (const id of renderIds) {
      const n = byId.get(id);
      if (!n) continue;
      n.isCurrent = id === currentId;
      n.isSelected = selected.has(id);
      n.isTextHit = filtered.textHits.has(id);
      n.isPinned = pinned.has(id);
      n.isFocus = id === filters.focusId;
      n.clusterKey = nodeClusterKey({ path: n.path, type: n.type }, clusterMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentId,
    selected,
    pinned,
    filtered.textHits,
    filters.focusId,
    clusterMode,
    renderIds,
  ]);

  // 簇→颜色映射(none → undefined,层内按类型上色)。
  const clusterColors = useMemo(() => {
    if (clusterMode === "none") return undefined;
    const keys = renderIds.map((id) => {
      const n = nodesByIdRef.current.get(id);
      return nodeClusterKey(
        { path: n?.path ?? "", type: n?.type ?? null },
        clusterMode,
      );
    });
    return assignClusterColors(keys);
  }, [renderIds, clusterMode]);

  const themeIsDark = useMemo(() => isDarkTheme(), [snapshot]);

  // 簇计数(图例用)。none → 空。
  const clusterCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (clusterMode === "none") return m;
    for (const id of renderIds) {
      const n = nodesByIdRef.current.get(id);
      const key = nodeClusterKey(
        { path: n?.path ?? "", type: n?.type ?? null },
        clusterMode,
      );
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [renderIds, clusterMode]);

  const updatePinned = useCallback(
    (next: Set<number>) => {
      setPinned(next);
      pinPathsRef.current = pinIdsToPaths(next, model.byId);
    },
    [model.byId],
  );

  // 力参数 / Recalculate / 切回 force → 重施力 + reheat。
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setForcesToken((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcesKey, recalcToken]);
  useEffect(() => {
    if (!mountedRef.current) return;
    if (layoutMode === "force") setForcesToken((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

  // 首次有图 + 尺寸就绪(+ 暖启动)后 fit 一次。
  const didFitRef = useRef(false);
  useEffect(() => {
    didFitRef.current = false;
  }, [root]);
  useEffect(() => {
    if (didFitRef.current) return;
    if (renderIds.length === 0 || size.w === 0 || size.h === 0) return;
    if (!layoutReady && warmPositionsRef.current.size === 0) return;
    didFitRef.current = true;
    const id = setTimeout(() => setFitToken((n) => n + 1), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderIds.length, size.w, size.h, layoutReady]);

  const fit = useCallback(() => setFitToken((n) => n + 1), []);
  const zoomBy = useCallback(
    (factor: number) => setZoomCmd((c) => ({ token: c.token + 1, factor })),
    [],
  );

  // 焦点飞入当前文档:位置就绪后取节点坐标 centerAt+zoom(每 30 tick 重试一次)。
  const didFlyRef = useRef(false);
  useEffect(() => {
    didFlyRef.current = false;
  }, [currentId]);
  useEffect(() => {
    didFlyRef.current = false;
  }, [root]);
  useEffect(() => {
    if (currentId == null || didFlyRef.current) return;
    const n = nodesByIdRef.current.get(currentId);
    if (!n || n.x == null || n.y == null) return;
    didFlyRef.current = true;
    setFlyTo((f) => ({
      x: n.x!,
      y: n.y!,
      zoom: 1.4,
      token: (f?.token ?? 0) + 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, positionsTick]);

  const handlePositionsStable = useCallback(
    (pos: Map<number, Pt>) => {
      positionsRef.current = pos;
      bumpPositions();
    },
    [],
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
        label: t("graph.menu.pathFrom"),
        icon: <PathIcon size={13} />,
        onClick: () => {
          setPathFrom(n.id);
          setPathResult(null);
        },
      },
    );
    if (pathFrom != null && pathFrom !== n.id) {
      items.push({
        label: t("graph.menu.pathTo"),
        icon: <PathIcon size={13} />,
        onClick: () => {
          const r = shortestPath(model, pathFrom, n.id);
          setPathResult(r ? { ids: r } : "unreachable");
        },
      });
    }
    items.push(
      { separator: true, label: "" },
      {
        label: t("graph.menu.hideType", { type: n.type ?? t("graph.typeless") }),
        icon: <EyeSlash size={13} />,
        onClick: () =>
          setFilters((f) => ({ ...f, types: toggleSet(f.types, tp) })),
      },
    );
    return items;
  }, [menu, filters, pinned, pathFrom, model, t, actions, updatePinned]);

  if (!snapshot || allNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">{t("graph.empty")}</p>
      </div>
    );
  }

  const nodeById = nodeByIdFull;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-base">
      {size.w > 0 && size.h > 0 && (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[12px] text-overlay">
              {t("graph.sim.warm")}
            </div>
          }
        >
          <GraphForceLayer
            graphData={graphData}
            width={size.w}
            height={size.h}
            forces={forces}
            layoutMode={layoutMode}
            cooldownTicks={COOLDOWN_TICKS}
            forcesToken={forcesToken}
            clusterColors={clusterColors}
            themeIsDark={themeIsDark}
            adj={adjSet}
            fitToken={fitToken}
            zoomToken={zoomCmd.token}
            zoomFactor={zoomCmd.factor}
            flyTo={flyTo}
            onNodeClick={(id) => {
              const n = model.byId.get(id);
              if (n) actions.selectNote(n.path);
            }}
            onNodeDoubleClick={(id) =>
              setFilters((f) => ({ ...f, focusId: id, hops: 1 }))
            }
            onNodeRightClick={(id, x, y) => {
              const n = nodeById.get(id);
              if (n) setMenu({ x, y, node: n });
            }}
            onNodeHover={(id, x, y) => {
              if (id != null && x != null && y != null) {
                const n = nodeById.get(id);
                if (n) setPreview({ x, y, node: n });
              } else {
                setPreview(null);
              }
            }}
            onBackgroundClick={() => setSelected(new Set())}
            onNodeDragEnd={(id, _x, _y, moved) => {
              if (moved) {
                const next = new Set(pinned);
                next.add(id);
                updatePinned(next);
              }
            }}
            onBoxSelect={(ids) => setSelected(new Set(ids))}
            onPositionsStable={handlePositionsStable}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute left-2 top-2 rounded bg-mantle/80 px-2 py-1 text-[11px] text-overlay backdrop-blur-sm">
        {t("graph.stats", {
          nodes: renderIds.length,
          edges: linksRef.current.length,
        })}
        {filtered.nodeIds.size > WEBGL_MAX_NODES && (
          <span className="text-red">
            {t("graph.truncated", { n: WEBGL_MAX_NODES })}
          </span>
        )}
      </div>

      {pathFrom != null && (
        <div className="absolute left-2 top-11 max-w-[min(70vw,28rem)] rounded bg-mantle/95 px-2 py-1.5 text-[11px] shadow-lg ring-1 ring-crust backdrop-blur-sm">
          <div className="flex items-center gap-1.5 text-subtext">
            <PathIcon size={12} />
            <span className="truncate">
              {pathResult == null
                ? t("graph.pathFromHint", {
                    name: model.byId.get(pathFrom)?.title ?? String(pathFrom),
                  })
                : pathResult === "unreachable"
                  ? t("graph.pathUnreachable", {
                      from: model.byId.get(pathFrom)?.title ?? "",
                    })
                  : t("graph.pathResult", { hops: pathResult.ids.length - 1 })}
            </span>
            <button
              onClick={() => {
                setPathFrom(null);
                setPathResult(null);
              }}
              className="ml-auto shrink-0 text-overlay hover:text-red"
              aria-label={t("common.close")}
            >
              <X size={12} />
            </button>
          </div>
          {pathResult && pathResult !== "unreachable" && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {pathResult.ids.map((id, i) => {
                const nd = model.byId.get(id);
                return (
                  <span key={id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-overlay">→</span>}
                    <button
                      className="rounded bg-surface px-1 py-0.5 text-subtext hover:bg-surface2"
                      onClick={() => nd && actions.selectNote(nd.path)}
                      title={nd?.path}
                    >
                      {nd?.title ?? String(id)}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

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

      <div className="absolute right-2 top-2 flex items-center gap-1">
        <label className="flex items-center gap-1 rounded bg-mantle/90 px-1.5 py-1 text-[11px] text-overlay backdrop-blur-sm">
          <span className="sr-only">{t("graph.layout")}</span>
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            className="max-w-[7.5rem] cursor-pointer bg-transparent text-subtext outline-none"
            title={t("graph.layout")}
          >
            <option value="force">{t("graph.layout.force")}</option>
            <option value="type-layer">{t("graph.layout.typeLayer")}</option>
            <option value="timeline">{t("graph.layout.timeline")}</option>
          </select>
        </label>
        <button
          onClick={() => bumpRecalc()}
          className="rounded bg-mantle/80 p-1.5 text-overlay hover:text-text backdrop-blur-sm"
          title={t("graph.recalculate")}
        >
          <ArrowsClockwise size={13} />
        </button>
        <button
          onClick={() => setShowHealth((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-[11px] backdrop-blur-sm",
            showHealth
              ? "bg-mauve text-crust"
              : "bg-mantle/80 text-overlay hover:text-text",
          )}
          title={t("graph.health")}
        >
          <Graph size={13} />
          {t("graph.health")}
        </button>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-[11px] backdrop-blur-sm",
            showFilters
              ? "bg-blue text-crust"
              : "bg-mantle/80 text-overlay hover:text-text",
          )}
        >
          <Funnel size={13} />
          {t("graph.filter")}
        </button>
      </div>

      {clusterMode !== "none" && clusterColors && (
        <GraphLegend
          colors={clusterColors}
          counts={clusterCounts}
          mode={clusterMode}
          themeIsDark={themeIsDark}
          t={t}
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
          clusterMode={clusterMode}
          onClusterMode={setClusterMode}
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

      {showHealth && (
        <HealthPanel
          mode={healthMode}
          onMode={setHealthMode}
          orphans={orphanNodes}
          hubs={hubs}
          onPick={(id) => {
            setFilters((f) => ({ ...f, focusId: id, hops: 1 }));
            const n = model.byId.get(id);
            if (n) actions.selectNote(n.path);
          }}
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
  clusterMode,
  onClusterMode,
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
  clusterMode: ClusterMode;
  onClusterMode: (m: ClusterMode) => void;
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

      <Section title={t("graph.cluster.mode")}>
        <div className="flex gap-1">
          {(["folder", "type", "none"] as ClusterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onClusterMode(m)}
              className={cn(
                "flex-1 rounded px-1 py-0.5",
                clusterMode === m
                  ? "bg-blue text-crust"
                  : "bg-surface text-overlay hover:text-text",
              )}
            >
              {m === "folder"
                ? t("graph.cluster.folder")
                : m === "type"
                  ? t("graph.cluster.type")
                  : t("graph.cluster.none")}
            </button>
          ))}
        </div>
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

      <label className="flex cursor-pointer items-center gap-1.5 py-0.5 text-subtext">
        <input
          type="checkbox"
          checked={filters.hideUnresolved}
          onChange={() =>
            onChange({ ...filters, hideUnresolved: !filters.hideUnresolved })
          }
        />
        <span>{t("graph.hideUnresolved")}</span>
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

function HealthPanel({
  mode,
  onMode,
  orphans,
  hubs,
  onPick,
  t,
}: {
  mode: "orphans" | "hubs";
  onMode: (m: "orphans" | "hubs") => void;
  orphans: GraphNode[];
  hubs: Hub[];
  onPick: (id: number) => void;
  t: TFunc;
}) {
  return (
    <div className="absolute left-2 top-12 max-h-[calc(100%-4rem)] w-56 overflow-y-auto rounded bg-mantle/95 p-2 text-[11px] shadow-lg ring-1 ring-crust backdrop-blur-sm">
      <div className="mb-1.5 flex gap-1">
        {(["orphans", "hubs"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            className={cn(
              "flex-1 rounded px-1.5 py-1 text-[11px]",
              mode === m
                ? "bg-mauve text-crust"
                : "bg-surface text-overlay hover:text-text",
            )}
          >
            {m === "orphans"
              ? `${t("graph.orphans")} (${orphans.length})`
              : `${t("graph.hubs")} (${hubs.length})`}
          </button>
        ))}
      </div>

      {mode === "orphans" ? (
        orphans.length === 0 ? (
          <p className="py-2 text-center text-overlay">{t("graph.noOrphans")}</p>
        ) : (
          orphans.map((n) => (
            <HealthRow
              key={n.id}
              title={n.title}
              path={n.path}
              type={n.type}
              onClick={() => onPick(n.id)}
            />
          ))
        )
      ) : hubs.length === 0 ? (
        <p className="py-2 text-center text-overlay">{t("graph.noHubs")}</p>
      ) : (
        hubs.map((h) => (
          <HealthRow
            key={h.id}
            title={h.title}
            path={h.path}
            type={null}
            badge={`°${h.degree}`}
            onClick={() => onPick(h.id)}
          />
        ))
      )}
    </div>
  );
}

function HealthRow({
  title,
  path,
  type,
  badge,
  onClick,
}: {
  title: string;
  path: string;
  type: string | null;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="mb-0.5 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-subtext hover:bg-surface"
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: colorFor(type) }}
      />
      <span className="flex-1 truncate" title={path}>
        {title || path}
      </span>
      {badge && <span className="shrink-0 text-overlay">{badge}</span>}
    </button>
  );
}

function GraphLegend({
  colors,
  counts,
  mode,
  themeIsDark,
  t,
}: {
  colors: Map<string, ClusterColor>;
  counts: Map<string, number>;
  mode: ClusterMode;
  themeIsDark: boolean;
  t: TFunc;
}) {
  const { entries, overflow } = topClusters(counts, 8);
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-12 max-h-[60%] max-w-[14rem] overflow-y-auto rounded bg-mantle/85 px-2 py-1.5 text-[10px] shadow ring-1 ring-crust backdrop-blur-sm">
      <div className="mb-1 uppercase tracking-wide text-overlay">
        {t("graph.legend.title")}
      </div>
      {entries.map((e) => {
        const cc = colors.get(e.key);
        const color = cc ? (themeIsDark ? cc.dark : cc.light) : "transparent";
        const label =
          mode === "type"
            ? e.key === "—"
              ? t("graph.typeless")
              : e.key
              : e.key === "/"
                ? "/"
                : e.key;
        return (
          <div key={e.key} className="flex items-center gap-1.5 py-0.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <span className="flex-1 truncate text-subtext" title={e.key}>
              {label}
            </span>
            <span className="shrink-0 text-overlay">{e.count}</span>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="mt-0.5 text-overlay">
          {t("graph.legend.more", { n: overflow })}
        </div>
      )}
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
