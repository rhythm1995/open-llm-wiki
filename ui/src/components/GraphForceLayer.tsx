/**
 * GraphForceLayer —— react-force-graph-2d canvas 图谱层(MIT)。
 *
 * 取代旧的 sigma/WebGL 层。职责:挂载 ForceGraph2D,用原生 d3-force 布局,
 * 转发交互,实时绘制节点状态环 / 标签芯片 / 簇色 / 悬停邻域高亮。布局坐标由内部
 * d3-force 持有;父组件以**稳定身份**的 graphData 喂入(结构变化才增删节点,
 * 状态变化就地改字段——rfg 按 id 复用节点对象,x/y/fx/fy 得以保留)。
 *
 * 交互(与旧 sigma 层对齐):点击/双击/右键节点、拖拽→自动钉(fx/fy)、
 * Shift+拖框选、滚轮缩放 + 外部 fit/zoom/flyTo token、悬停邻域高亮。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
} from "react-force-graph-2d";
import * as d3 from "d3-force";
import type { ForceParams, Pt } from "../lib/graph-layout";
import type { LayoutMode } from "../lib/graph-modes";
import {
  baseBgResolved,
  colorWithAlpha,
  edgeColorResolved,
  labelColorResolved,
  nodeRingStyle,
  nodeSizeFromDegree,
  nodeVisualState,
  typeColorResolved,
  unresolvedColorResolved,
} from "../lib/graph-style";
import { d3ForceParams } from "../lib/graph-d3-forces";
import {
  planCanvasLabels,
  type CanvasLabelCandidate,
} from "../lib/graph-canvas-labels";
import type { ClusterColor } from "../lib/graph-cluster";

export interface GraphNodeInput {
  id: number;
  path: string;
  title: string;
  type: string | null;
  tags?: string[];
  status?: string | null;
  degree: number;
  /** 布局:d3-force 读写。 */
  x?: number;
  y?: number;
  /** 钉住(用户 pin / 拖拽后):力导向不动。 */
  fx?: number;
  fy?: number;
  /** 每帧状态(父组件就地改字段)。 */
  isCurrent?: boolean;
  isSelected?: boolean;
  isTextHit?: boolean;
  isPinned?: boolean;
  isFocus?: boolean;
  isGhost?: boolean;
  /** 悬空链接目标桩。 */
  isMissing?: boolean;
  clusterKey?: string;
}

export interface GraphLinkInput {
  source: number;
  target: number;
  kind: "wiki" | "relation" | "unresolved";
  hot?: boolean;
  weight?: number;
}

export interface CameraTransform {
  x: number;
  y: number;
  k: number;
}

interface Props {
  graphData: { nodes: GraphNodeInput[]; links: GraphLinkInput[] };
  width: number;
  height: number;
  forces: ForceParams;
  layoutMode: LayoutMode;
  /** 力导向收敛 tick;冻结模式(type-layer/timeline)传 0。 */
  cooldownTicks: number;
  /** 递增 = 重新施加力 + reheat(Recalculate / 滑条变化 / 模式切回 force)。 */
  forcesToken: number;
  /** 簇→颜色映射(父组件按 renderIds 构好);缺省按类型上色。 */
  clusterColors?: Map<string, ClusterColor>;
  themeIsDark?: boolean;
  /** 无向邻接表,悬停时高亮邻居;缺省不高亮邻域。 */
  adj?: ReadonlyMap<number, ReadonlySet<number>>;
  fitToken: number;
  zoomToken: number;
  zoomFactor: number;
  flyTo?: { x: number; y: number; zoom: number; token: number } | null;
  onNodeClick: (id: number) => void;
  onNodeDoubleClick: (id: number) => void;
  onNodeRightClick: (id: number, clientX: number, clientY: number) => void;
  onNodeHover: (id: number | null, x?: number, y?: number) => void;
  onBackgroundClick: () => void;
  onNodeDragEnd: (id: number, x: number, y: number, moved: boolean) => void;
  onBoxSelect: (ids: number[]) => void;
  onCameraTransform?: (t: CameraTransform) => void;
  /** 布局稳定时回调最新位置(父组件落盘)。 */
  onPositionsStable?: (pos: Map<number, Pt>) => void;
}

type FGNode = NodeObject<GraphNodeInput>;

const LABEL_FONT = "Inter, system-ui, sans-serif";
const LABEL_CHIP_H = 16;
const LABEL_PAD_X = 8;
const LABEL_GAP_X = 6;
const LABEL_MIN_W = 24;
const LABEL_MAX = 60;

export function GraphForceLayer(props: Props) {
  const {
    graphData,
    width,
    height,
    layoutMode,
    cooldownTicks,
    forcesToken,
    fitToken,
    zoomToken,
    zoomFactor,
    flyTo,
    onBackgroundClick,
  } = props;

  const fgRef = useRef<ForceGraphMethods<any, any> | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // 最新 props 的 ref(回调里读,避免闭包陈旧 + 避免 rfg 因回调身份变化重挂)。
  const propsRef = useRef(props);
  propsRef.current = props;

  // 渲染期热状态(不触发 React 重渲染)。
  const hoveredIdRef = useRef<number | null>(null);
  const kRef = useRef(1);
  const labelPlanRef = useRef<Map<number, string>>(new Map());
  const tickCountRef = useRef(0);
  const lastClickRef = useRef<{ id: number; at: number } | null>(null);

  // Shift 框选。
  const [shiftHeld, setShiftHeld] = useState(false);
  const boxRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const boxRectRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // 文本测量用的离屏 ctx(屏像素,固定字号 → 与绘制字号 /k 线性一致)。
  const measCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const c = document.createElement("canvas").getContext("2d");
    if (c) {
      c.font = `${LABEL_CHIP_H}px ${LABEL_FONT}`;
      measCtxRef.current = c;
    }
  }, []);

  const measure = useCallback((text: string): number => {
    const ctx = measCtxRef.current;
    if (!ctx) return text.length * 7;
    return ctx.measureText(text).width;
  }, []);

  // ── 重新规划标签(每 tick / 缩放 / 悬停后) ──────────────────────
  const recomputeLabels = useCallback(() => {
    const k = kRef.current;
    const nodes = propsRef.current.graphData.nodes;
    if (nodes.length === 0) {
      labelPlanRef.current = new Map();
      return;
    }
    const hovered = hoveredIdRef.current;
    const cands: CanvasLabelCandidate[] = nodes.map((n) => ({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      title: n.title,
      degree: n.degree,
      isCurrent: n.isCurrent,
      isHover: n.id === hovered,
      isSelected: n.isSelected,
      isTextHit: n.isTextHit,
      isPinned: n.isPinned,
      isFocus: n.isFocus,
      radius: nodeSizeFromDegree(n.degree),
    }));
    const plan = planCanvasLabels(cands, {
      scale: k,
      measure,
      maxLabels: LABEL_MAX,
      chipHeight: LABEL_CHIP_H,
      padX: LABEL_PAD_X,
      gapX: LABEL_GAP_X,
      minChipWidth: LABEL_MIN_W,
    });
    const m = new Map<number, string>();
    for (const p of plan) m.set(p.id, p.text);
    labelPlanRef.current = m;
  }, [measure]);

  // ── 施加 d3 力 ─────────────────────────────────────────────────
  const applyForces = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const p = propsRef.current;
    const cfg = d3ForceParams(p.forces, {
      w: p.width,
      h: p.height,
      nodeCount: p.graphData.nodes.length,
    });
    fg.d3Force("charge", d3.forceManyBody().strength(cfg.chargeStrength));
    fg.d3Force(
      "link",
      d3
        .forceLink(p.graphData.links as any[])
        .id((d: any) => d.id)
        .distance(cfg.linkDistance)
        .strength(cfg.linkStrength),
    );
    fg.d3Force("x", d3.forceX(p.width / 2).strength(cfg.xStrength));
    fg.d3Force("y", d3.forceY(p.height / 2).strength(cfg.yStrength));
    // 用 forceX/Y 做向心引力,关掉默认 forceCenter 避免双重居中。
    fg.d3Force("center", null);
  }, []);

  // forcesToken → 重施力 + reheat。
  useEffect(() => {
    if (forcesToken === 0) return;
    applyForces();
    fgRef.current?.d3ReheatSimulation();
  }, [forcesToken, applyForces]);

  // 结构变化(父组件给出新 graphData 包裹对象)→ rfg 的 graphData onChange 会暂停
  // 引擎,故 force 模式须重新 reheat;type-layer/timeline 全员 fx/fy 冻结,无需 reheat。
  useEffect(() => {
    applyForces();
    if (propsRef.current.layoutMode === "force") {
      fgRef.current?.d3ReheatSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, applyForces]);

  // fit。
  useEffect(() => {
    if (fitToken === 0) return;
    const fg = fgRef.current;
    if (!fg || propsRef.current.graphData.nodes.length === 0) return;
    fg.zoomToFit(300, 60);
  }, [fitToken]);

  // zoom in/out。
  useEffect(() => {
    if (!zoomToken || zoomFactor === 1) return;
    const fg = fgRef.current;
    if (!fg) return;
    const cur = fg.zoom();
    fg.zoom(Math.max(0.15, Math.min(8, cur * zoomFactor)), 160);
  }, [zoomToken, zoomFactor]);

  // fly-to(焦点动画)。
  useEffect(() => {
    if (!flyTo || flyTo.token === 0) return;
    const fg = fgRef.current;
    if (!fg) return;
    fg.centerAt(flyTo.x, flyTo.y, 320);
    fg.zoom(flyTo.zoom, 320);
  }, [flyTo]);

  const emitPositions = useCallback(() => {
    const cb = propsRef.current.onPositionsStable;
    if (!cb) return;
    const m = new Map<number, Pt>();
    for (const n of propsRef.current.graphData.nodes) {
      if (n.isGhost || n.isMissing) continue;
      if (n.x == null || n.y == null) continue;
      m.set(n.id, { x: n.x, y: n.y });
    }
    cb(m);
  }, []);

  const handleEngineTick = useCallback(() => {
    tickCountRef.current++;
    if (tickCountRef.current % 6 === 0) recomputeLabels();
    if (tickCountRef.current % 30 === 0) emitPositions();
  }, [recomputeLabels, emitPositions]);

  const handleEngineStop = useCallback(() => {
    recomputeLabels();
    emitPositions();
  }, [recomputeLabels, emitPositions]);

  const handleZoom = useCallback(
    (t: { x: number; y: number; k: number }) => {
      kRef.current = t.k;
      propsRef.current.onCameraTransform?.(t);
      recomputeLabels();
    },
    [recomputeLabels],
  );

  // ── 框选 ───────────────────────────────────────────────────────
  const paintBox = () => {
    const box = boxRef.current;
    const el = boxRectRef.current;
    if (!box || !el) return;
    el.style.display = "block";
    el.style.left = `${Math.min(box.x0, box.x1)}px`;
    el.style.top = `${Math.min(box.y0, box.y1)}px`;
    el.style.width = `${Math.abs(box.x1 - box.x0)}px`;
    el.style.height = `${Math.abs(box.y1 - box.y0)}px`;
  };

  const finishBox = useCallback(() => {
    const box = boxRef.current;
    boxRef.current = null;
    if (boxRectRef.current) boxRectRef.current.style.display = "none";
    if (!box) return;
    const x0 = Math.min(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const x1 = Math.max(box.x0, box.x1);
    const y1 = Math.max(box.y0, box.y1);
    if (x1 - x0 < 4 && y1 - y0 < 4) return;
    const fg = fgRef.current;
    if (!fg) return;
    const hits: number[] = [];
    for (const n of propsRef.current.graphData.nodes) {
      if (n.isGhost || n.isMissing) continue;
      if (n.x == null || n.y == null) continue;
      const s = fg.graph2ScreenCoords(n.x, n.y);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) hits.push(n.id);
    }
    propsRef.current.onBoxSelect(hits);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftHeld(false);
        finishBox();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [finishBox]);

  const onOverlayPointerDown = (e: ReactPointerEvent) => {
    if (!shiftHeld) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    boxRef.current = { x0: x, y0: y, x1: x, y1: y };
    paintBox();
  };
  const onOverlayPointerMove = (e: ReactPointerEvent) => {
    const box = boxRef.current;
    if (!box) return;
    box.x1 = e.nativeEvent.offsetX;
    box.y1 = e.nativeEvent.offsetY;
    paintBox();
  };
  const onOverlayPointerUp = () => finishBox();

  // ── 节点绘制 ───────────────────────────────────────────────────
  const drawNode = (node: FGNode, ctx: CanvasRenderingContext2D, k: number) => {
    const n = node as GraphNodeInput & { x: number; y: number };
    const p = propsRef.current;
    const hovered = hoveredIdRef.current;
    const lit =
      hovered == null || n.id === hovered || !!p.adj?.get(hovered)?.has(n.id);
    const screenR = nodeSizeFromDegree(n.degree);
    const r = screenR / k;

    // 填色。
    let color: string;
    if (n.isMissing || n.isGhost) color = unresolvedColorResolved();
    else if (p.clusterColors && n.clusterKey && p.clusterColors.has(n.clusterKey)) {
      const cc = p.clusterColors.get(n.clusterKey)!;
      color = p.themeIsDark ? cc.dark : cc.light;
    } else color = typeColorResolved(n.type);
    if (!lit) color = colorWithAlpha(color, 0.18);

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // 状态环。
    const ring = nodeRingStyle(
      nodeVisualState({
        isCurrent: n.isCurrent,
        isSelected: n.isSelected,
        isMissing: n.isMissing,
        isGhost: n.isGhost,
      }),
    );
    if (ring.ringWidth > 0) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + (ring.ringWidth + 1.5) / k, 0, Math.PI * 2);
      ctx.strokeStyle = colorWithAlpha(ring.ringColor, ring.ringAlpha);
      ctx.lineWidth = ring.ringWidth / k;
      if (ring.dashed) ctx.setLineDash([3 / k, 3 / k]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 标签芯片(几何与 planCanvasLabels 一致,图空间)。
    const text = labelPlanRef.current.get(n.id);
    if (text) {
      const w =
        Math.max(LABEL_MIN_W, measure(text) + LABEL_PAD_X * 2) / k;
      const h = LABEL_CHIP_H / k;
      const x0 = n.x + (screenR + LABEL_GAP_X) / k;
      const y0 = n.y - h / 2;
      ctx.beginPath();
      roundRectPath(ctx, x0, y0, w, h, 4 / k);
      ctx.fillStyle = colorWithAlpha(baseBgResolved(), 0.72);
      ctx.fill();
      ctx.font = `${LABEL_CHIP_H / k}px ${LABEL_FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = lit
        ? labelColorResolved()
        : colorWithAlpha(labelColorResolved(), 0.5);
      ctx.fillText(text, x0 + LABEL_PAD_X / k, y0 + h / 2);
    }
  };

  const nodeLabel = (node: FGNode) => {
    const n = node as GraphNodeInput;
    if (!n.title) return "";
    return n.tags?.length ? `${n.title} · ${n.tags.join(", ")}` : n.title;
  };

  const linkEndpoints = (l: any): { sid: number; tid: number } => ({
    sid: typeof l.source === "number" ? l.source : (l.source as FGNode).id,
    tid: typeof l.target === "number" ? l.target : (l.target as FGNode).id,
  });

  const linkColor = (l: any) => {
    const { sid, tid } = linkEndpoints(l);
    const hovered = hoveredIdRef.current;
    const hot = !!l.hot || (hovered != null && (hovered === sid || hovered === tid));
    if (l.kind === "unresolved") return colorWithAlpha(unresolvedColorResolved(), 0.7);
    return edgeColorResolved(l.kind, hot);
  };
  const linkWidth = (l: any) => {
    const { sid, tid } = linkEndpoints(l);
    const hovered = hoveredIdRef.current;
    const hot = !!l.hot || (hovered != null && (hovered === sid || hovered === tid));
    if (l.kind === "unresolved") return 0.6;
    const base = l.kind === "relation" ? 1.1 : 0.7;
    const w = Math.min(2.5, base * (1 + Math.log2((l.weight ?? 1) + 1)));
    return hot ? w + 0.6 : w;
  };

  const handleNodeClick = (node: FGNode) => {
    const n = node as GraphNodeInput;
    if (n.isGhost || n.isMissing) return;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) | 0;
    const last = lastClickRef.current;
    lastClickRef.current = { id: n.id, at: now };
    if (last && last.id === n.id && now - last.at < 280) {
      lastClickRef.current = null;
      propsRef.current.onNodeDoubleClick(n.id);
      return;
    }
    propsRef.current.onNodeClick(n.id);
  };
  const handleNodeRightClick = (node: FGNode, e: MouseEvent) => {
    const n = node as GraphNodeInput;
    if (n.isGhost || n.isMissing) return;
    propsRef.current.onNodeRightClick(n.id, e.clientX, e.clientY);
  };
  const handleNodeHover = (node: FGNode | null) => {
    const id = node ? (node as GraphNodeInput).id : null;
    hoveredIdRef.current = id;
    let x: number | undefined;
    let y: number | undefined;
    const fg = fgRef.current;
    if (node && fg && hostRef.current) {
      const nn = node as GraphNodeInput;
      if (nn.x != null && nn.y != null) {
        const s = fg.graph2ScreenCoords(nn.x, nn.y);
        const r = hostRef.current.getBoundingClientRect();
        x = r.left + s.x;
        y = r.top + s.y;
      }
    }
    propsRef.current.onNodeHover(id, x, y);
    recomputeLabels();
    fg?.resumeAnimation?.();
  };
  const handleNodeDragEnd = (node: FGNode, translate: { x: number; y: number }) => {
    const n = node as GraphNodeInput & { x: number; y: number };
    // 钉住:拖拽后位置固定。
    n.fx = n.x;
    n.fy = n.y;
    const moved = Math.hypot(translate.x, translate.y) > 0.5;
    propsRef.current.onNodeDragEnd(n.id, n.x, n.y, moved);
  };

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full"
      style={{ width, height, background: baseBgResolved() }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ForceGraph2D<GraphNodeInput, GraphLinkInput>
        ref={fgRef as any}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor={baseBgResolved()}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeRelSize={1}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={(node: FGNode, color: string, ctx: CanvasRenderingContext2D, k: number) => {
          const n = node as GraphNodeInput & { x: number; y: number };
          const extra = n.isMissing ? 6 : 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, (nodeSizeFromDegree(n.degree) + extra) / k, 0, Math.PI * 2);
          ctx.fill();
        }}
        nodeLabel={nodeLabel}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={(l: any) => (l.kind === "relation" ? 3.5 : 0)}
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalArrowColor={(l: any) => edgeColorResolved(l.kind, false)}
        cooldownTicks={layoutMode === "force" ? cooldownTicks : 0}
        enableNodeDrag={!shiftHeld}
        enablePanInteraction={(e: MouseEvent) => !e.shiftKey}
        enableZoomInteraction
        autoPauseRedraw={false}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={handleNodeHover}
        onNodeDragEnd={handleNodeDragEnd}
        onBackgroundClick={() => onBackgroundClick()}
        onEngineTick={handleEngineTick}
        onEngineStop={handleEngineStop}
        onZoom={handleZoom}
      />
      {/* 框选:Shift 时拦截指针,否则透传给 canvas。 */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: shiftHeld ? "auto" : "none",
          cursor: "crosshair",
        }}
        onPointerDown={onOverlayPointerDown}
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
      />
      <div
        ref={boxRectRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          border: "1px solid rgba(30,102,245,0.85)",
          background: "rgba(30,102,245,0.12)",
          display: "none",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
    </div>
  );
}

/** 圆角矩形路径(兼容无 ctx.roundRect 的环境)。 */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
