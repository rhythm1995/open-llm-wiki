/**
 * ForceGraphLayer —— Canvas 力导向渲染层(F-GRAPH 主路径,替代 Cytoscape)。
 *
 * 观感对齐 OpenWiki visualizer:径向 glow、实心核、边曲率 + 有向粒子、
 * 邻域 dim、选中不抢镜头。数据契约与原 CytoscapeLayer 对齐,父组件
 * (GraphView + graph-* 纯逻辑)无感切换。
 *
 * 依赖:`force-graph`(MIT,npm 打包,离线可用)。
 */
import { useEffect, useRef } from "react";
import ForceGraph from "force-graph";
// @ts-expect-error d3-force-3d has no published types in our tree
import { forceCollide } from "d3-force-3d";
import type { ForceParams, Pt } from "../lib/graph-layout";
import type { LayoutMode } from "../lib/graph-modes";
import {
  clampCameraToContent,
  contentBBox,
  isViewportEmpty,
  type CameraState,
} from "../lib/graph-camera";
import {
  colorWithAlpha,
  edgeColorResolved,
  graphAccentResolved,
  graphCanvasBgResolved,
  isDarkTheme,
  labelColorResolved,
  nodeSizeFromDegree,
  typeColorResolved,
  unresolvedColorResolved,
} from "../lib/graph-style";
import type { ClusterColor } from "../lib/graph-cluster";

export interface GraphNodeInput {
  id: number;
  path: string;
  title: string;
  type: string | null;
  tags?: string[];
  status?: string | null;
  degree: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  isCurrent?: boolean;
  isSelected?: boolean;
  isTextHit?: boolean;
  isPinned?: boolean;
  isFocus?: boolean;
  isGhost?: boolean;
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

export interface ForceGraphLayerProps {
  graphData: { nodes: GraphNodeInput[]; links: GraphLinkInput[] };
  width: number;
  height: number;
  forces: ForceParams;
  layoutMode: LayoutMode;
  cooldownTicks: number;
  forcesToken: number;
  clusterColors?: Map<string, ClusterColor>;
  themeIsDark?: boolean;
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
  onPositionsStable?: (pos: Map<number, Pt>) => void;
  /** 视口是否完全看不到内容(父组件显示「回到图」)。 */
  onViewportEmptyChange?: (empty: boolean) => void;
}

/** force-graph 内部节点(身份跨 reload 复用,保留 x/y)。 */
interface FGNode {
  id: number;
  /** path 稳定主键:聚焦裁切进出时用 path 找回坐标,避免回全图一坨。 */
  path: string;
  title: string;
  color: string;
  r: number;
  degree: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  isCurrent?: boolean;
  isSelected?: boolean;
  isMissing?: boolean;
  isGhost?: boolean;
  isTextHit?: boolean;
  isPinned?: boolean;
  isFocus?: boolean;
  /** 邻域 hover 时非邻居压暗。 */
  dim?: boolean;
}

interface FGLink {
  source: number | FGNode;
  target: number | FGNode;
  kind: "wiki" | "relation" | "unresolved";
  hot?: boolean;
}

type FGInstance = ForceGraph<FGNode, FGLink>;

const PAD = 36;

function nodeFill(
  n: GraphNodeInput,
  clusterColors: Map<string, ClusterColor> | undefined,
  themeIsDark: boolean | undefined,
): string {
  if (clusterColors && n.clusterKey) {
    const cc = clusterColors.get(n.clusterKey);
    if (cc) return themeIsDark ? cc.dark : cc.light;
  }
  return typeColorResolved(n.type);
}

function linkEndpointId(end: number | FGNode): number {
  return typeof end === "object" ? end.id : end;
}

export function ForceGraphLayer(props: ForceGraphLayerProps): React.ReactElement {
  const {
    graphData,
    width,
    height,
    forces,
    layoutMode,
    cooldownTicks,
    forcesToken,
    clusterColors,
    themeIsDark,
    fitToken,
    zoomToken,
    zoomFactor,
    flyTo,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<FGInstance | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const pointerRef = useRef({ x: 0, y: 0 });

  /** id → 持久节点对象(保坐标)。聚焦裁切时**不删除**,只是暂不喂给 graphData。 */
  const nodesMapRef = useRef<Map<number, FGNode>>(new Map());
  /**
   * path → 最后已知坐标。退出聚焦/换邻域时节点会「消失再出现」,
   * 必须从这里恢复,绝不能当新节点钉在质心(一坨 + 落在聚焦区后方)。
   */
  const savedPosByPathRef = useRef<Map<string, Pt>>(new Map());
  const highlightNodes = useRef<Set<FGNode>>(new Set());
  const highlightLinks = useRef<Set<FGLink>>(new Set());
  /** 选中后锁定邻域高亮,hover 不抢。 */
  const selectionLock = useRef<number | null>(null);
  const lastClickRef = useRef<{ id: number; t: number } | null>(null);
  const stableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const camTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstForcesToken = useRef(true);
  const didFitAfterLayout = useRef(false);
  /** 布局已收敛:钉住全部坐标,点击/选中不得再 reheat。 */
  const layoutFrozenRef = useRef(false);
  /** 节点 id 集合 + 边签名;仅结构变化才重跑力。 */
  const structureSigRef = useRef("");
  const viewportEmptyRef = useRef(false);
  /** 防止 clamp→onZoomEnd→clamp 反馈环。 */
  const clampingRef = useRef(false);
  /** content bbox 缓存(结构/布局变时失效)。 */
  const cachedBBoxRef = useRef<ReturnType<typeof contentBBox>>(null);
  const bboxDirtyRef = useRef(true);

  const contentNodesForCamera = (): FGNode[] => {
    const g = gRef.current;
    if (!g) return [];
    return g.graphData().nodes.filter(
      (n) =>
        !n.isMissing &&
        n.x != null &&
        n.y != null &&
        !(n.x === 0 && n.y === 0),
    );
  };

  const getContentBBox = () => {
    if (!bboxDirtyRef.current && cachedBBoxRef.current) {
      return cachedBBoxRef.current;
    }
    const box = contentBBox(contentNodesForCamera());
    cachedBBoxRef.current = box;
    bboxDirtyRef.current = false;
    return box;
  };

  const invalidateBBox = () => {
    bboxDirtyRef.current = true;
  };

  const readCam = (): CameraState | null => {
    const g = gRef.current;
    if (!g) return null;
    const c = g.centerAt();
    return { x: c.x, y: c.y, k: g.zoom() };
  };

  const applyCam = (cam: CameraState) => {
    const g = gRef.current;
    if (!g) return;
    // 必须 0ms:带动画会连触发 onZoomEnd → 卡顿/反馈环
    clampingRef.current = true;
    g.centerAt(cam.x, cam.y, 0);
    g.zoom(cam.k, 0);
    // 下一帧再允许 onZoomEnd 处理
    requestAnimationFrame(() => {
      clampingRef.current = false;
    });
  };

  /** 软边界:钳相机,不改节点坐标。仅松手时调用。 */
  const clampCamera = () => {
    if (clampingRef.current) return;
    const g = gRef.current;
    if (!g) return;
    const cam = readCam();
    if (!cam) return;
    const box = getContentBBox();
    if (!box) return;
    const w = propsRef.current.width;
    const h = propsRef.current.height;
    if (w <= 0 || h <= 0) return;
    const next = clampCameraToContent(cam, box, w, h, 0.45);
    if (
      Math.abs(next.x - cam.x) > 1 ||
      Math.abs(next.y - cam.y) > 1 ||
      Math.abs(next.k - cam.k) > 0.01
    ) {
      applyCam(next);
    }
    reportViewportEmpty();
  };

  /** 让当前可见内容进入视口(结构变化 / 重排结束 / 回到图)。 */
  const ensureVisible = (ms = 350) => {
    const g = gRef.current;
    if (!g) return;
    invalidateBBox();
    const nodes = contentNodesForCamera();
    if (nodes.length === 0) {
      reportViewportEmpty();
      return;
    }
    const prefer = (n: FGNode) =>
      !n.isMissing &&
      ((n.degree ?? 0) > 0 || !!n.isCurrent || !!n.isSelected);
    const hasPrefer = nodes.some(prefer);
    clampingRef.current = true;
    g.zoomToFit(ms, PAD + 28, (n) =>
      hasPrefer ? prefer(n) : !n.isMissing,
    );
    // fit 结束后软钳 + 恢复交互;延迟避开 zoom 动画中的 onZoomEnd 风暴
    window.setTimeout(() => {
      clampingRef.current = false;
      invalidateBBox();
      clampCamera();
    }, Math.max(ms, 0) + 50);
  };

  const reportViewportEmpty = () => {
    const g = gRef.current;
    if (!g) return;
    const cam = readCam();
    if (!cam) return;
    const box = getContentBBox();
    const empty = isViewportEmpty(
      cam,
      box,
      propsRef.current.width,
      propsRef.current.height,
    );
    // 仅状态变化时通知 React — 避免每帧 setState 拖垮主线程
    if (empty === viewportEmptyRef.current) return;
    viewportEmptyRef.current = empty;
    propsRef.current.onViewportEmptyChange?.(empty);
  };

  const rememberPos = (path: string, x: number, y: number) => {
    if (!path || !Number.isFinite(x) || !Number.isFinite(y)) return;
    // 跳过 (0,0) 占位
    if (x === 0 && y === 0) return;
    savedPosByPathRef.current.set(path, { x, y });
  };

  const recallPos = (path: string, id: number): Pt | null => {
    if (path) {
      const p = savedPosByPathRef.current.get(path);
      if (p) return p;
    }
    const o = nodesMapRef.current.get(id);
    if (o && o.x != null && o.y != null && !(o.x === 0 && o.y === 0)) {
      return { x: o.x, y: o.y };
    }
    return null;
  };

  const structureSignature = (
    nodes: GraphNodeInput[],
    links: GraphLinkInput[],
  ): string => {
    const ids = nodes
      .map((n) => n.id)
      .sort((a, b) => a - b)
      .join(",");
    const es = links
      .map((l) => `${l.source}>${l.target}:${l.kind}`)
      .sort()
      .join("|");
    return `${ids}#${es}`;
  };

  /** 钉住当前坐标(停止后/每帧保冻结)+ 写入 path 记忆。 */
  const freezeAllPositions = () => {
    for (const n of nodesMapRef.current.values()) {
      if (n.x != null && n.y != null) {
        n.fx = n.x;
        n.fy = n.y;
        rememberPos(n.path, n.x, n.y);
      }
    }
    layoutFrozenRef.current = true;
    invalidateBBox();
    // 冻结后停掉持续重绘:hover/点击仍会由 force-graph 交互触发帧
    gRef.current?.autoPauseRedraw(true);
  };

  /** 解冻以便重排(仅 Recalculate / 力参 / 结构变化)。 */
  const unfreezeForRelayout = () => {
    layoutFrozenRef.current = false;
    for (const n of nodesMapRef.current.values()) {
      // 用户 pin 的仍钉住(由 isPinned / 父级 fx 决定,此处先全开,sync 再钉 pin)
      n.fx = undefined;
      n.fy = undefined;
    }
    gRef.current?.autoPauseRedraw(false);
    gRef.current?.resumeAnimation();
    invalidateBBox();
  };

  const emitPositions = () => {
    const g = gRef.current;
    if (!g) return;
    if (stableTimer.current) return;
    stableTimer.current = setTimeout(() => {
      stableTimer.current = null;
      const m = new Map<number, Pt>();
      for (const n of g.graphData().nodes) {
        if (n.x != null && n.y != null) {
          m.set(n.id, { x: n.x, y: n.y });
          rememberPos(n.path, n.x, n.y);
        }
      }
      propsRef.current.onPositionsStable?.(m);
    }, 400);
  };

  const emitCamera = () => {
    const g = gRef.current;
    if (!g) return;
    if (camTimer.current) return;
    camTimer.current = setTimeout(() => {
      camTimer.current = null;
      const c = g.centerAt();
      propsRef.current.onCameraTransform?.({
        x: c.x,
        y: c.y,
        k: g.zoom(),
      });
    }, 80);
  };

  const clearHighlight = () => {
    highlightNodes.current.clear();
    highlightLinks.current.clear();
    for (const n of nodesMapRef.current.values()) n.dim = false;
  };

  const applyNeighborhood = (node: FGNode | null) => {
    clearHighlight();
    if (!node || !gRef.current) return;
    highlightNodes.current.add(node);
    const adj = propsRef.current.adj;
    const neigh = adj?.get(node.id);
    for (const l of gRef.current.graphData().links) {
      const s = linkEndpointId(l.source);
      const t = linkEndpointId(l.target);
      const touch = s === node.id || t === node.id;
      if (touch) {
        highlightLinks.current.add(l);
        const sn = nodesMapRef.current.get(s);
        const tn = nodesMapRef.current.get(t);
        if (sn) highlightNodes.current.add(sn);
        if (tn) highlightNodes.current.add(tn);
      }
    }
    if (neigh) {
      for (const id of neigh) {
        const n = nodesMapRef.current.get(id);
        if (n) highlightNodes.current.add(n);
      }
    }
    // dim 非高亮
    for (const n of nodesMapRef.current.values()) {
      n.dim = !highlightNodes.current.has(n);
    }
  };

  const paintNode = (
    n: FGNode,
    ctx: CanvasRenderingContext2D,
    scale: number,
  ) => {
    if (n.x === undefined || n.y === undefined) return;
    const hot =
      highlightNodes.current.has(n) && highlightNodes.current.size > 0;
    const actuallyDim =
      highlightNodes.current.size > 0 ? !highlightNodes.current.has(n) : false;
    const r = n.r;
    const base = actuallyDim ? 0.14 : 1;

    // glow 只给当前/选中/邻域热节点;常态几乎无光晕,避免盖住边。
    if (!actuallyDim && (n.isCurrent || n.isSelected || hot)) {
      const gr = r * (n.isCurrent || n.isSelected ? 1.85 : 1.55);
      const glow = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, gr);
      glow.addColorStop(
        0,
        colorWithAlpha(n.color, n.isCurrent || n.isSelected ? 0.32 : 0.2),
      );
      glow.addColorStop(1, colorWithAlpha(n.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, gr, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.globalAlpha = base;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
    if (n.isMissing) {
      ctx.fillStyle = graphCanvasBgResolved();
      ctx.fill();
      ctx.setLineDash([2.5 / scale, 2 / scale]);
      ctx.strokeStyle = unresolvedColorResolved();
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // 浅色图:选中保持类型色+深描边;深色图才用白核。
      const dark = isDarkTheme();
      const emphasize = !!(n.isCurrent || n.isSelected);
      ctx.fillStyle = emphasize && dark ? "#FFFFFF" : n.color;
      ctx.fill();
      if (emphasize || hot || n.isPinned) {
        ctx.lineWidth = (emphasize ? 2.2 : 1.5) / scale;
        ctx.strokeStyle = dark
          ? colorWithAlpha("#FFFFFF", 0.95)
          : colorWithAlpha("#1A2740", 0.85);
        ctx.stroke();
      } else if (n.isGhost) {
        ctx.setLineDash([2.5 / scale, 2 / scale]);
        ctx.strokeStyle = colorWithAlpha(n.color, 0.55);
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (n.isTextHit && !actuallyDim) {
      ctx.lineWidth = 1.2 / scale;
      ctx.strokeStyle = graphAccentResolved();
      ctx.stroke();
    }

    const showLabel =
      scale > 0.55 ||
      n.isCurrent ||
      n.isSelected ||
      hot ||
      n.isFocus ||
      (n.degree ?? 0) >= 6;
    if (showLabel && n.title) {
      const fs = Math.max(10 / scale, 3.2);
      ctx.font = `${n.isCurrent || n.isSelected ? 700 : 600} ${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const y = n.y + r + 2.5 / scale;
      ctx.globalAlpha = actuallyDim ? 0.22 : 1;
      ctx.lineWidth = 3.5 / scale;
      ctx.strokeStyle = colorWithAlpha(graphCanvasBgResolved(), 0.92);
      ctx.strokeText(n.title, n.x, y);
      ctx.fillStyle = labelColorResolved();
      ctx.fillText(n.title, n.x, y);
    }
    ctx.globalAlpha = 1;
  };

  const applyForces = () => {
    const g = gRef.current;
    if (!g) return;
    const f = propsRef.current.forces;
    const charge = g.d3Force("charge") as
      | { strength?: (v: number) => void }
      | undefined;
    // 斥力 + 边长 + 碰撞:拉开簇,边仍可读。
    charge?.strength?.(-420 * Math.max(0.05, f.repel));
    const link = g.d3Force("link") as
      | {
          distance?: (v: number | ((l: FGLink) => number)) => void;
          strength?: (v: number | ((l: FGLink) => number)) => void;
        }
      | undefined;
    link?.distance?.(96 * Math.max(0.1, f.linkDistance));
    link?.strength?.(0.28 * Math.max(0, f.linkStrength));
    let collide = g.d3Force("collide") as
      | { radius: (fn: (n: FGNode) => number) => unknown; strength: (v: number) => unknown }
      | undefined;
    if (!collide) {
      collide = forceCollide() as typeof collide;
      g.d3Force("collide", collide as never);
    }
    collide?.radius((n) => (n.r ?? 4) + 14);
    collide?.strength(0.95);
  };

  /**
   * 同步节点/边到 force-graph。
   * - 仅 **结构签名** 变化或 force 参数要求时才 reheat;
   * - 选中/当前/主题色变化只改字段,布局钉死不动。
   */
  const syncGraphData = (opts?: { forceRelayout?: boolean }) => {
    const g = gRef.current;
    if (!g) return;
    const src = propsRef.current.graphData;
    const cc = propsRef.current.clusterColors;
    const dark = propsRef.current.themeIsDark;
    const map = nodesMapRef.current;
    const nextIds = new Set(src.nodes.map((n) => n.id));
    const sig = structureSignature(src.nodes, src.links);
    const structureChanged = sig !== structureSigRef.current;
    structureSigRef.current = sig;

    // 暂离视野的节点:记住坐标,保留在 map 里(勿 delete → 退出聚焦才能归位)
    for (const id of [...map.keys()]) {
      if (!nextIds.has(id)) {
        const parked = map.get(id)!;
        if (parked.x != null && parked.y != null) {
          rememberPos(parked.path, parked.x, parked.y);
          parked.fx = parked.x;
          parked.fy = parked.y;
        }
      }
    }

    const nodes: FGNode[] = [];
    for (const n of src.nodes) {
      let o = map.get(n.id);
      const isNew = !o;
      if (!o) {
        o = {
          id: n.id,
          path: n.path ?? "",
          title: n.title,
          color: nodeFill(n, cc, dark),
          r: Math.max(3, nodeSizeFromDegree(n.degree)),
          degree: n.degree,
        };
        map.set(n.id, o);
      }
      o.id = n.id;
      o.path = n.path ?? o.path ?? "";
      o.title = n.title;
      o.degree = n.degree;
      o.color = nodeFill(n, cc, dark);
      // 半径不因 isCurrent 缩放 — 避免选中时 collide 推挤。
      o.r = Math.max(2.5, n.isMissing ? 3 : nodeSizeFromDegree(n.degree));
      o.isCurrent = n.isCurrent;
      o.isSelected = n.isSelected;
      o.isMissing = n.isMissing;
      o.isGhost = n.isGhost;
      o.isTextHit = n.isTextHit;
      o.isPinned = n.isPinned;
      o.isFocus = n.isFocus;

      // 坐标恢复优先级:已有 o.x → path 记忆 → 父组件 warm → 邻居均值 → 质心
      const recalled = recallPos(o.path, n.id);
      if (o.x == null || o.y == null || (isNew && recalled)) {
        if (recalled) {
          o.x = recalled.x;
          o.y = recalled.y;
        } else if (n.x != null && n.y != null && !(n.x === 0 && n.y === 0)) {
          o.x = n.x;
          o.y = n.y;
        }
      }

      if (propsRef.current.layoutMode !== "force") {
        if (n.x != null) {
          o.x = n.x;
          o.fx = n.x;
        }
        if (n.y != null) {
          o.y = n.y;
          o.fy = n.y;
        }
      } else if (n.fx != null && n.fy != null) {
        // 父级 pin
        o.fx = n.fx;
        o.fy = n.fy;
        if (n.x != null) o.x = n.x;
        if (n.y != null) o.y = n.y;
      } else if (layoutFrozenRef.current && !opts?.forceRelayout) {
        // 已冻结:有记忆/坐标则钉回原位;真·全新节点才靠邻居,绝不全体堆质心
        if (o.x != null && o.y != null) {
          o.fx = o.x;
          o.fy = o.y;
          rememberPos(o.path, o.x, o.y);
        } else {
          // 真新节点:邻居已可见坐标的均值
          let sx = 0;
          let sy = 0;
          let c = 0;
          for (const l of src.links) {
            const other =
              l.source === n.id ? l.target : l.target === n.id ? l.source : null;
            if (other == null) continue;
            const p = map.get(other);
            if (p && p.x != null && p.y != null) {
              sx += p.x;
              sy += p.y;
              c++;
            }
          }
          if (c > 0) {
            o.x = sx / c + (Math.random() - 0.5) * 24;
            o.y = sy / c + (Math.random() - 0.5) * 24;
          } else {
            let cx = 0;
            let cy = 0;
            let k = 0;
            for (const p of map.values()) {
              if (p.id === o.id) continue;
              if (p.x != null && p.y != null) {
                cx += p.x;
                cy += p.y;
                k++;
              }
            }
            o.x = (k ? cx / k : 0) + (Math.random() - 0.5) * 80;
            o.y = (k ? cy / k : 0) + (Math.random() - 0.5) * 80;
          }
          o.fx = o.x;
          o.fy = o.y;
          if (o.path) rememberPos(o.path, o.x, o.y);
        }
      } else if (opts?.forceRelayout || structureChanged) {
        // 即将 reheat:用户 pin 保留,其余放开
        if (n.isPinned && n.fx != null && n.fy != null) {
          o.fx = n.fx;
          o.fy = n.fy;
        } else {
          o.fx = undefined;
          o.fy = undefined;
        }
      }
      nodes.push(o);
    }

    const links: FGLink[] = src.links.map((l) => ({
      source: l.source,
      target: l.target,
      kind: l.kind,
      hot: l.hot,
    }));

    // 同步数据前保存相机:force-graph 在部分 graphData 更新路径会扰动视口。
    // 点选导致的结构微调不得把图甩到角落。
    const cam = {
      x: g.centerAt().x,
      y: g.centerAt().y,
      k: g.zoom(),
    };
    g.graphData({ nodes, links });
    invalidateBBox();
    applyForces();
    if (layoutFrozenRef.current && !opts?.forceRelayout) {
      clampingRef.current = true;
      g.centerAt(cam.x, cam.y, 0);
      g.zoom(cam.k, 0);
      requestAnimationFrame(() => {
        clampingRef.current = false;
      });
    }

    if (propsRef.current.layoutMode !== "force") {
      layoutFrozenRef.current = true;
      g.cooldownTicks(0);
      requestAnimationFrame(() => ensureVisible(300));
      return;
    }

    // 显式重排(重排按钮 / 力参 / 首次)
    if (opts?.forceRelayout) {
      // 节点 fx 已在上面循环里按 pin 规则放开
      layoutFrozenRef.current = false;
      for (const o of nodes) {
        if (!o.isPinned) {
          o.fx = undefined;
          o.fy = undefined;
        }
      }
      g.graphData({ nodes, links });
      g.cooldownTicks(Math.min(propsRef.current.cooldownTicks, 100));
      g.d3AlphaDecay(0.06);
      g.d3VelocityDecay(0.4);
      g.d3ReheatSimulation();
      return;
    }

    // 已冻结:结构增删也不 reheat(退出聚焦的节点已从 path 记忆归位)
    if (layoutFrozenRef.current) {
      freezeAllPositions();
      // 聚焦进出 / scope 切换:统一 ensureVisible,避免停在空白
      if (structureChanged && nodes.length > 0) {
        requestAnimationFrame(() => ensureVisible(350));
      } else {
        reportViewportEmpty();
      }
      return;
    }

    // 尚未冻结且结构变了:跑力(首次加载 / 解冻后)
    if (structureChanged) {
      g.cooldownTicks(Math.min(propsRef.current.cooldownTicks, 100));
      g.d3AlphaDecay(0.06);
      g.d3VelocityDecay(0.4);
      g.d3ReheatSimulation();
    }
  };

  // ── 挂载 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return;
    const g = new ForceGraph<FGNode, FGLink>(hostRef.current);
    gRef.current = g;

    g.backgroundColor(graphCanvasBgResolved())
      .nodeRelSize(4)
      .nodeId("id")
      .linkSource("source")
      .linkTarget("target")
      .nodeCanvasObjectMode(() => "replace")
      .nodeCanvasObject(paintNode)
      .nodePointerAreaPaint((n, color, ctx) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, (n.r ?? 4) + 3, 0, 2 * Math.PI);
        ctx.fill();
      })
      .linkColor((l) => {
        const s = linkEndpointId(l.source);
        const t = linkEndpointId(l.target);
        const sn = nodesMapRef.current.get(s);
        const tn = nodesMapRef.current.get(t);
        const dimmed =
          highlightNodes.current.size > 0 &&
          !highlightLinks.current.has(l) &&
          !(sn && highlightNodes.current.has(sn) && tn && highlightNodes.current.has(tn));
        if (dimmed) return colorWithAlpha(edgeColorResolved("wiki", false), 0.08);
        if (highlightLinks.current.has(l) || l.hot) {
          return graphAccentResolved();
        }
        if (l.kind === "unresolved") {
          return colorWithAlpha(unresolvedColorResolved(), 0.65);
        }
        if (l.kind === "relation") {
          return colorWithAlpha(edgeColorResolved("relation", false), 0.75);
        }
        // 常态边更实,优先「看得见关系」
        return edgeColorResolved("wiki", false);
      })
      .linkWidth((l) =>
        highlightLinks.current.has(l) || l.hot
          ? 1.8
          : l.kind === "relation"
            ? 1.35
            : 1.15,
      )
      .linkCurvature(0.08)
      .linkLineDash((l) => (l.kind === "unresolved" ? [3, 3] : null))
      // 粒子:默认全关;仅邻域/选中高亮边开细粒子
      .linkDirectionalParticles((l) =>
        highlightLinks.current.has(l) || l.hot ? 2 : 0,
      )
      .linkDirectionalParticleWidth(0.9)
      .linkDirectionalParticleSpeed(0.004)
      .linkDirectionalParticleColor(() => graphAccentResolved())
      // 仿真中持续画;收敛 freeze 后改 true(见 freezeAllPositions)
      .autoPauseRedraw(false)
      .cooldownTicks(cooldownTicks)
      .warmupTicks(80)
      .enableNodeDrag(true)
      .minZoom(0.08)
      .maxZoom(4)
      .onNodeClick((n, ev) => {
        const now = performance.now();
        const last = lastClickRef.current;
        if (last && last.id === n.id && now - last.t < 320) {
          lastClickRef.current = null;
          propsRef.current.onNodeDoubleClick(n.id);
          return;
        }
        lastClickRef.current = { id: n.id, t: now };
        selectionLock.current = n.id;
        applyNeighborhood(n);
        // 故意不 centerAt —— 与 OpenWiki 一致:读页不拽图
        propsRef.current.onNodeClick(n.id);
        void ev;
      })
      .onNodeRightClick((n, ev) => {
        propsRef.current.onNodeRightClick(n.id, ev.clientX, ev.clientY);
        ev.preventDefault();
      })
      .onNodeHover((n) => {
        const { x, y } = pointerRef.current;
        if (selectionLock.current != null) {
          // 锁定选中时只改光标,不改邻域
          if (hostRef.current) {
            hostRef.current.style.cursor = n ? "pointer" : "";
          }
          if (n) propsRef.current.onNodeHover(n.id, x, y);
          else propsRef.current.onNodeHover(null);
          return;
        }
        applyNeighborhood(n);
        if (hostRef.current) {
          hostRef.current.style.cursor = n ? "pointer" : "";
        }
        if (n) propsRef.current.onNodeHover(n.id, x, y);
        else propsRef.current.onNodeHover(null);
      })
      .onBackgroundClick(() => {
        selectionLock.current = null;
        clearHighlight();
        propsRef.current.onBackgroundClick();
      })
      .onNodeDrag((n) => {
        // 拖拽中临时解钉该点,其余保持冻结
        n.fx = n.x;
        n.fy = n.y;
      })
      .onNodeDragEnd((n) => {
        n.fx = n.x;
        n.fy = n.y;
        if (n.x != null && n.y != null) rememberPos(n.path, n.x, n.y);
        propsRef.current.onNodeDragEnd(n.id, n.x ?? 0, n.y ?? 0, true);
        // 拖完继续冻住全图,避免整图跟着晃
        freezeAllPositions();
        emitPositions();
      })
      .onEngineStop(() => {
        freezeAllPositions();
        emitPositions();
        // 力收敛:首次或重排后 ensureVisible
        if (!didFitAfterLayout.current && g.graphData().nodes.length > 0) {
          didFitAfterLayout.current = true;
          ensureVisible(450);
        } else {
          clampCamera();
        }
      })
      .onZoomEnd(() => {
        // 动画/程序改相机时跳过,避免反馈环
        if (clampingRef.current) return;
        // 松手软边界:瞬时钳制,无动画
        clampCamera();
        emitCamera();
      });

    applyForces();
    layoutFrozenRef.current = false;
    syncGraphData({ forceRelayout: true });

    return () => {
      if (stableTimer.current) clearTimeout(stableTimer.current);
      if (camTimer.current) clearTimeout(camTimer.current);
      g._destructor();
      gRef.current = null;
      nodesMapRef.current.clear();
      savedPosByPathRef.current.clear();
      didFitAfterLayout.current = false;
      layoutFrozenRef.current = false;
      structureSigRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 结构 / 主题:结构变才可能 reheat;主题只改色
  useEffect(() => {
    syncGraphData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  useEffect(() => {
    // 主题/簇色:只改填充,不碰力
    const src = propsRef.current.graphData;
    const cc = propsRef.current.clusterColors;
    const dark = propsRef.current.themeIsDark;
    for (const n of src.nodes) {
      const o = nodesMapRef.current.get(n.id);
      if (o) o.color = nodeFill(n, cc, dark);
    }
    gRef.current?.backgroundColor(graphCanvasBgResolved());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterColors, themeIsDark]);

  // 每帧状态(父组件就地改 GraphNodeInput)——绝不 reheat / 绝不解冻
  useEffect(() => {
    const src = propsRef.current.graphData;
    const cc = propsRef.current.clusterColors;
    const dark = propsRef.current.themeIsDark;
    for (const n of src.nodes) {
      const o = nodesMapRef.current.get(n.id);
      if (!o) continue;
      o.isCurrent = n.isCurrent;
      o.isSelected = n.isSelected;
      o.isMissing = n.isMissing;
      o.isGhost = n.isGhost;
      o.isTextHit = n.isTextHit;
      o.isPinned = n.isPinned;
      o.isFocus = n.isFocus;
      o.title = n.title;
      o.color = nodeFill(n, cc, dark);
      o.r = Math.max(2.5, n.isMissing ? 3 : nodeSizeFromDegree(n.degree));
      if (layoutFrozenRef.current || n.isPinned) {
        if (n.fx != null && n.fy != null) {
          o.fx = n.fx;
          o.fy = n.fy;
        } else if (o.x != null && o.y != null) {
          o.fx = o.x;
          o.fy = o.y;
        }
      }
    }
    // 当前笔记变更时锁邻域高亮(纯绘制)
    if (props.graphData.nodes.some((n) => n.isCurrent)) {
      const cur = props.graphData.nodes.find((n) => n.isCurrent);
      if (cur) {
        selectionLock.current = cur.id;
        const o = nodesMapRef.current.get(cur.id);
        if (o) applyNeighborhood(o);
      }
    }
  });

  useEffect(() => {
    if (firstForcesToken.current) {
      firstForcesToken.current = false;
      return;
    }
    // 仅用户点「重排」/ 改力参 / 切布局 → 解冻并 reheat
    const g = gRef.current;
    if (!g) return;
    if (layoutMode === "force") {
      unfreezeForRelayout();
      didFitAfterLayout.current = false; // 停后 ensureVisible
      applyForces();
      g.cooldownTicks(Math.min(cooldownTicks, 100));
      g.d3AlphaDecay(0.06);
      g.d3VelocityDecay(0.4);
      g.d3ReheatSimulation();
    } else {
      syncGraphData({ forceRelayout: true });
      requestAnimationFrame(() => ensureVisible(300));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcesToken, layoutMode, forces, cooldownTicks]);

  useEffect(() => {
    gRef.current?.width(width).height(height);
  }, [width, height]);

  useEffect(() => {
    if (fitToken === 0) return;
    ensureVisible(350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    g.zoom(g.zoom() * zoomFactor, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomToken]);

  useEffect(() => {
    const g = gRef.current;
    if (!g || !flyTo) return;
    if (!Number.isFinite(flyTo.x) || !Number.isFinite(flyTo.y)) return;
    // 拒绝飞向 (0,0) 占位(未布局节点),否则整图看起来「跑去左上角」。
    if (flyTo.x === 0 && flyTo.y === 0) return;
    g.centerAt(flyTo.x, flyTo.y, 400);
    g.zoom(flyTo.zoom, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full"
      style={{ width, height, background: graphCanvasBgResolved() }}
      onPointerMove={(e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };
      }}
    />
  );
}
