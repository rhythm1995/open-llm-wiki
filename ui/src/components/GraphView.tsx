/**
 * GraphView —— 关系图谱(F-GRAPH,force-graph Canvas 主路径)。
 *
 * 架构:
 *   graph-filter  → 可见集
 *   graph-model   → path-stable / degree / topK / structureSig
 *   graph-modes   → type-layer / timeline preset 坐标
 *   ForceGraphLayer → Canvas 力导向 + OpenWiki 气质 paint(懒加载 chunk)
 *
 * 视野两层(用户心智):
 *   1. 稳定偏好 scope:跟随当前笔记 | 全库
 *   2. 临时镜头 focusId:聚焦此处 N 跳 —— 双击/右键/摘要卡同一入口;点空白或 Esc 退出
 * 属性过滤为第三层,有徽章提示。
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
  GRAPH_MAX_NODES,
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
import { neighborhoodOf } from "../lib/graph-neighborhood";
import { nodeWikilink } from "../lib/wikilink";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import type { GraphLinkInput, GraphNodeInput } from "./ForceGraphLayer";

// force-graph 体积大:懒加载独立 chunk。
const ForceGraphLayerLazy = lazy(() =>
  import("./ForceGraphLayer").then((m) => ({ default: m.ForceGraphLayer })),
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
/** 力导向 tick 上限;收敛后 ForceGraphLayer 会冻结坐标,点击不再 reheat。 */
const COOLDOWN_TICKS = 90;

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
  // P2:高级过滤默认折叠,图面先干净。
  const [showFilters, setShowFilters] = useState(false);
  // 6B4:图健康面板(Orphans / Hubs),默认关。
  const [showHealth, setShowHealth] = useState(false);
  /** 更多(布局/范围/重排)折叠进一个面板。 */
  const [showMore, setShowMore] = useState(false);
  /** 视口完全看不到节点(相机层上报)。 */
  const [viewportEmpty, setViewportEmpty] = useState(false);
  const [healthMode, setHealthMode] = useState<"orphans" | "hubs">("orphans");
  // 6A5:最短路径。pathFrom 由右键菜单设定;pathResult 为 id 序列 / 不可达 / 未计算。
  const [pathFrom, setPathFrom] = useState<number | null>(null);
  const [pathResult, setPathResult] = useState<
    { ids: number[] } | "unreachable" | null
  >(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [clusterMode, setClusterMode] = useState<ClusterMode>("none");
  // 范围:默认只画当前笔记的 N 跳邻域(图小而干净,参见 inkeep 2-hop / openwiki 不画全局);
  // 切到 all 恢复全 vault。无 currentId 时邻域退化为全量。
  const [scopeMode, setScopeMode] = useState<"neighborhood" | "all">(
    "neighborhood",
  );
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
  /** 保留 zoom API 给渲染层;主路径用滚轮,角钮已撤。 */
  const zoomCmd = { token: 0, factor: 1 };
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

  // 全图无向邻接(邻域 BFS 用,不受 renderSet 限制——adj 依赖 renderSet 会成环)。
  const fullAdj = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const e of filtered.edges) {
      if (e.to == null) continue;
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [filtered.edges]);

  // 邻域:当前笔记 N 跳邻居(纯函数 BFS,见 graph-neighborhood)。邻域模式关或无 currentId → null(=全量)。
  const NEIGHBOR_HOPS = 2;
  const neighborhoodIds = useMemo(() => {
    if (scopeMode !== "neighborhood" || currentId == null) return null;
    return neighborhoodOf(fullAdj, currentId, NEIGHBOR_HOPS);
  }, [fullAdj, currentId, scopeMode]);

  const renderIds = useMemo(
    () =>
      topKByDegree(
        neighborhoodIds ? [...neighborhoodIds] : [...filtered.nodeIds],
        degree,
        GRAPH_MAX_NODES,
      ),
    [filtered.nodeIds, degree, neighborhoodIds],
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

    // 防御:剔除端点不在当前节点集(byId)的 link,杜绝喂给 Cytoscape 悬空边
    // (其 initialize 会 find 并抛 "node not found")。ghost 桩已在 byId,不受影响。
    for (let i = links.length - 1; i >= 0; i--) {
      const l = links[i];
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (!byId.has(s as number) || !byId.has(t as number)) links.splice(i, 1);
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
  /** 临时镜头:聚焦此处(双击 / 右键 / 摘要卡同一入口)。 */
  const focusHere = useCallback((id: number, hops = 1) => {
    setFilters((f) => ({ ...f, focusId: id, hops }));
  }, []);
  /** 退出临时聚焦(点空白 / Esc / 芯片 × / 右键)。不清 scope。 */
  const clearFocus = useCallback(() => {
    setFilters((f) =>
      f.focusId == null ? f : { ...f, focusId: null },
    );
  }, []);
  // Esc → 退出聚焦
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filters.focusId == null && pathFrom == null) return;
      e.preventDefault();
      clearFocus();
      setPathFrom(null);
      setPathResult(null);
      setShowMore(false);
      setShowFilters(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filters.focusId, pathFrom, clearFocus]);

  /** 属性过滤生效项数(不含 focus —— focus 单独芯片)。 */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.query.trim()) n++;
    if (filters.hideOrphans) n++;
    if (filters.hideUnresolved) n++;
    // types:初始为「全选」= 与 types 全集等长,不算生效;少了才算
    if (filters.types.size > 0 && filters.types.size < types.length) n++;
    if (filters.tags.size > 0) n++;
    if (filters.statuses.size > 0 && filters.statuses.size < statuses.length)
      n++;
    if (
      filters.relations.size > 0 &&
      filters.relations.size < 2
    )
      n++;
    return n;
  }, [filters, types.length, statuses.length]);

  const focusTitle =
    filters.focusId != null
      ? (model.byId.get(filters.focusId)?.title ?? String(filters.focusId))
      : "";

  /**
   * 焦点飞入:仅在「打开 vault / 切到图谱后首次有稳定坐标」时飞一次。
   * 绝不要在每次 currentId 变化时飞——图内点选会改 currentId,若再用父组件
   * 滞后的 n.x/n.y(常接近初始/原点) centerAt,相机会甩到左上角、中心大片空白。
   * 坐标优先 positionsRef(渲染层回写的真相),不要信 GraphNodeInput 上过期字段。
   */
  const didFlyRef = useRef(false);
  useEffect(() => {
    didFlyRef.current = false;
  }, [root]);
  useEffect(() => {
    if (didFlyRef.current) return;
    if (currentId == null) return;
    if (positionsTick === 0) return; // 等 ForceGraphLayer 至少回写过一次
    const p = positionsRef.current.get(currentId);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    // 拒绝明显未布局的 (0,0) 占位,避免 badcase 甩镜
    if (p.x === 0 && p.y === 0) return;
    didFlyRef.current = true;
    setFlyTo((f) => ({
      x: p.x,
      y: p.y,
      zoom: 1.25,
      token: (f?.token ?? 0) + 1,
    }));
  }, [currentId, positionsTick]);

  const handlePositionsStable = useCallback(
    (pos: Map<number, Pt>) => {
      positionsRef.current = pos;
      // 回写到节点对象,避免其它逻辑读到滞后的 n.x/n.y
      for (const [id, p] of pos) {
        const n = nodesByIdRef.current.get(id);
        if (n) {
          n.x = p.x;
          n.y = p.y;
        }
      }
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
        onClick: () => focusHere(n.id, 1),
      },
    ];
    if (filters.focusId != null) {
      items.push({
        label: t("graph.menu.clearFocus"),
        icon: <X size={13} />,
        onClick: () => clearFocus(),
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
  }, [
    menu,
    filters,
    pinned,
    pathFrom,
    model,
    t,
    actions,
    updatePinned,
    focusHere,
    clearFocus,
  ]);

  if (!snapshot || allNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">{t("graph.empty")}</p>
      </div>
    );
  }

  const nodeById = nodeByIdFull;

  const currentNode =
    currentId != null ? model.byId.get(currentId) ?? null : null;
  const currentDegree =
    currentId != null ? (degree.get(currentId) ?? 0) : 0;
  const neighborCount =
    currentId != null ? (adjSet.get(currentId)?.size ?? 0) : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        background: themeIsDark
          ? "var(--graph-canvas-bg, #050a16)"
          : "var(--graph-canvas-bg-light, #E8F0F8)",
      }}
    >
      {size.w > 0 && size.h > 0 && (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[12px] text-overlay">
              {t("graph.sim.warm")}
            </div>
          }
        >
          <ForceGraphLayerLazy
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
            onNodeDoubleClick={(id) => focusHere(id, 1)}
            onNodeRightClick={(id, x, y) => {
              const n = nodeById.get(id);
              if (n) setMenu({ x, y, node: n });
            }}
            onNodeHover={(id, x, y) => {
              if (id != null) {
                const n = nodeById.get(id);
                if (!n) return;
                // 同节点只更新坐标时跳过 setState,避免悬停拖垮 React
                setPreview((prev) => {
                  if (
                    prev &&
                    prev.node.id === n.id &&
                    prev.x === (x ?? size.w / 2) &&
                    prev.y === (y ?? 48)
                  ) {
                    return prev;
                  }
                  return {
                    x: x ?? size.w / 2,
                    y: y ?? 48,
                    node: n,
                  };
                });
              } else {
                setPreview((prev) => (prev == null ? prev : null));
              }
            }}
            onBackgroundClick={() => {
              // 临时模式退出:聚焦 / 路径 / 选中 / 浮层面板
              clearFocus();
              setPathFrom(null);
              setPathResult(null);
              setSelected(new Set());
              setShowMore(false);
              setShowFilters(false);
              setShowHealth(false);
              setPreview(null);
            }}
            onNodeDragEnd={(id, _x, _y, moved) => {
              if (moved) {
                const next = new Set(pinned);
                next.add(id);
                updatePinned(next);
              }
            }}
            onBoxSelect={(ids) => setSelected(new Set(ids))}
            onPositionsStable={handlePositionsStable}
            onViewportEmptyChange={setViewportEmpty}
          />
        </Suspense>
      )}

      {/* 视口空:不缩小世界,只救相机 */}
      {viewportEmpty && renderIds.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-xl bg-mantle/95 px-5 py-4 text-center shadow-xl ring-1 ring-crust backdrop-blur-md">
            <p className="text-[13px] font-medium text-text">
              {t("graph.viewportEmpty")}
            </p>
            <p className="text-[11px] text-overlay">
              {t("graph.viewportEmptyHint")}
            </p>
            <button
              type="button"
              onClick={() => {
                setViewportEmpty(false);
                fit();
              }}
              className="mt-1 rounded-lg bg-blue/15 px-3 py-1.5 text-[12px] font-medium text-blue ring-1 ring-blue/35 hover:bg-blue/25"
            >
              {t("graph.backToGraph")}
            </button>
          </div>
        </div>
      )}

      {/* 左上:stats + 视野状态芯片(一等公民) */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(28rem,calc(100%-8rem))] flex-col gap-1.5">
        <div className="w-fit rounded-lg bg-mantle/90 px-2.5 py-1 text-[11px] tracking-wide text-subtext shadow-sm ring-1 ring-crust/80 backdrop-blur-md">
          {t("graph.stats", {
            nodes: renderIds.length,
            edges: linksRef.current.length,
          })}
          {filtered.nodeIds.size > GRAPH_MAX_NODES && (
            <span className="text-red">
              {t("graph.truncated", { n: GRAPH_MAX_NODES })}
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          {/* 稳定偏好:跟随当前 / 全库 */}
          <button
            type="button"
            onClick={() =>
              setScopeMode((s) =>
                s === "neighborhood" ? "all" : "neighborhood",
              )
            }
            title={t("graph.chip.scopeHint")}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ring-1 backdrop-blur-md",
              scopeMode === "neighborhood"
                ? "bg-blue/15 text-blue ring-blue/35"
                : "bg-mantle/90 text-subtext ring-crust/80 hover:text-text",
            )}
          >
            {scopeMode === "neighborhood"
              ? t("graph.chip.scopeFollow")
              : t("graph.chip.scopeAll")}
          </button>
          {/* 临时镜头:聚焦 */}
          {filters.focusId != null && (
            <div
              className="flex max-w-full items-center gap-1 rounded-full bg-mauve/15 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-mauve shadow-sm ring-1 ring-mauve/30 backdrop-blur-md"
              title={t("graph.chip.exitHint")}
            >
              <Target size={12} className="shrink-0" />
              <span className="truncate">
                {t("graph.chip.focus", {
                  name: focusTitle,
                  hops: filters.hops,
                })}
              </span>
              <button
                type="button"
                onClick={clearFocus}
                className="rounded-full p-1 text-mauve/80 hover:bg-mauve/20 hover:text-mauve"
                aria-label={t("graph.chip.focusClear")}
                title={t("graph.chip.focusClear")}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {pathFrom != null && (
        <div className="absolute left-3 top-[4.75rem] z-10 max-w-[min(70vw,28rem)] rounded-xl bg-mantle/95 px-3 py-2 text-[11px] text-text shadow-lg ring-1 ring-crust backdrop-blur-md">
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
                      className="rounded-md bg-surface px-1.5 py-0.5 text-subtext hover:bg-surface2"
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

      {/* 仅保留适应视图(滚轮缩放足够) */}
      <div className="absolute bottom-3 left-3 z-10">
        <button
          onClick={fit}
          className="rounded-lg bg-mantle p-1.5 text-text shadow-md ring-1 ring-crust backdrop-blur-md hover:text-blue"
          title={t("graph.fit")}
        >
          <ArrowsOutSimple size={14} />
        </button>
      </div>

      {/* 当前笔记摘要卡 */}
      {currentNode && (
        <div className="absolute bottom-3 left-14 z-10 max-w-[min(22rem,calc(100%-8rem))] rounded-xl bg-mantle/95 px-3 py-2.5 shadow-lg ring-1 ring-crust backdrop-blur-md">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{
                background:
                  currentNode.type === "Source"
                    ? "#D4B56A"
                    : currentNode.type === "Concept"
                      ? "#B4A0E0"
                      : currentNode.type === "Entity"
                        ? "#5EC4B6"
                        : currentNode.type === "Summary"
                          ? "#7BC47F"
                          : "#7FC8FF",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-text">
                {currentNode.title}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-overlay">
                {currentNode.type && (
                  <span className="rounded-full bg-surface px-1.5 py-0.5 text-subtext">
                    {currentNode.type}
                  </span>
                )}
                {currentNode.status && (
                  <span className="rounded-full bg-surface px-1.5 py-0.5">
                    {currentNode.status}
                  </span>
                )}
                <span>
                  {t("graph.focusCard.degree", {
                    deg: currentDegree,
                    neighbors: neighborCount,
                  })}
                </span>
              </div>
              {currentNode.preview && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-subtext">
                  {currentNode.preview}
                </p>
              )}
            </div>
            <button
              className={cn(
                "shrink-0 rounded-md px-1.5 py-1 text-[10px] ring-1 hover:bg-surface2",
                filters.focusId === currentNode.id
                  ? "bg-mauve/15 text-mauve ring-mauve/30"
                  : "bg-surface text-blue ring-crust",
              )}
              onClick={() => {
                if (filters.focusId === currentNode.id) clearFocus();
                else focusHere(currentNode.id, 1);
              }}
              title={
                filters.focusId === currentNode.id
                  ? t("graph.chip.focusClear")
                  : t("graph.focusNeighborhood")
              }
            >
              <Target size={12} />
            </button>
          </div>
        </div>
      )}

      {/* 顶栏:过滤(有徽章) + 更多(布局/重排/健康;范围已提到芯片) */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <button
          onClick={() => {
            setShowFilters((v) => !v);
            setShowMore(false);
            setShowHealth(false);
          }}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] shadow-sm ring-1 backdrop-blur-md",
            showFilters || activeFilterCount > 0
              ? "bg-blue/15 text-blue ring-blue/40"
              : "bg-mantle/90 text-subtext ring-crust/80 hover:text-blue",
          )}
        >
          <Funnel size={13} />
          {activeFilterCount > 0
            ? t("graph.filterActive", { n: activeFilterCount })
            : t("graph.filter")}
        </button>
        <button
          onClick={() => {
            setShowMore((v) => !v);
            setShowFilters(false);
          }}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] shadow-sm ring-1 backdrop-blur-md",
            showMore
              ? "bg-blue/15 text-blue ring-blue/40"
              : "bg-mantle/90 text-subtext ring-crust/80 hover:text-blue",
          )}
          title={t("graph.more")}
        >
          <Graph size={13} />
          {t("graph.more")}
        </button>
      </div>

      {showMore && (
        <div className="absolute right-3 top-12 z-10 w-52 rounded-xl bg-mantle/95 p-2.5 text-[11px] text-text shadow-lg ring-1 ring-crust backdrop-blur-md">
          <label className="mb-2 flex flex-col gap-1 text-overlay">
            <span>{t("graph.layout")}</span>
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
              className="cursor-pointer rounded-md bg-surface px-2 py-1.5 text-text outline-none ring-1 ring-crust"
            >
              <option value="force">{t("graph.layout.force")}</option>
              <option value="type-layer">{t("graph.layout.typeLayer")}</option>
              <option value="timeline">{t("graph.layout.timeline")}</option>
            </select>
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => bumpRecalc()}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-surface px-2 py-1.5 text-subtext ring-1 ring-crust hover:text-blue"
              title={t("graph.recalculate")}
            >
              <ArrowsClockwise size={13} />
              {t("graph.recalculate")}
            </button>
          </div>
          <button
            onClick={() => {
              setShowHealth((v) => !v);
              setShowMore(false);
            }}
            className={cn(
              "mt-1.5 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 ring-1",
              showHealth
                ? "bg-blue/15 text-blue ring-blue/40"
                : "bg-surface text-subtext ring-crust hover:text-blue",
            )}
          >
            <Graph size={13} />
            {t("graph.health")}
          </button>
        </div>
      )}

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
    <div className="absolute right-3 top-12 max-h-[calc(100%-3rem)] w-52 overflow-y-auto rounded-xl bg-mantle/95 p-2.5 text-[11px] text-text shadow-lg ring-1 ring-crust backdrop-blur-md">
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
                title={t("graph.chip.focusClear")}
              >
                <X size={12} />
              </button>
            </div>
            <p className="mb-1 text-[10px] text-overlay">
              {t("graph.chip.exitHint")}
            </p>
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
              <Target size={11} /> {t("graph.focusNeighborhood")}
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
    <div className="absolute left-3 top-12 max-h-[calc(100%-4rem)] w-56 overflow-y-auto rounded-xl bg-mantle/95 p-2.5 text-[11px] text-text shadow-lg ring-1 ring-crust backdrop-blur-md">
      <div className="mb-1.5 flex gap-1">
        {(["orphans", "hubs"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            className={cn(
              "flex-1 rounded-md px-1.5 py-1 text-[11px]",
              mode === m
                ? "bg-blue/15 text-blue"
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
