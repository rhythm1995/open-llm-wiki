/**
 * CytoscapeLayer —— Cytoscape.js 渲染层,等价替换 GraphForceLayer。
 *
 * 数据管线(graph-model/filter/health/modes/layout-store/style)全部渲染器中立,
 * 这里只实现与 GraphForceLayer 相同的 Props 契约,把力导向/标签/交互搬到 Cytoscape:
 *  - force 模式 → cose 布局(warm 坐标存在则 randomize:false 微调,否则全新散布)
 *  - type-layer/timeline → preset(GraphView 已把 n.x/n.y 设好)
 *  - 节点配色/尺寸复用 graph-style 纯助手(typeColorResolved/nodeRingStyle/...)+ 簇色
 *  - 交互 tap/dbltap/cxttap/mouseover/dragfree/boxend 全接 Props 回调
 *  - cose 完成后 layoutstop + 拖拽后节流回写 onPositionsStable 供父组件落盘
 *
 * React 19 模式:命令式 useRef<Core> + useEffect 挂载/销毁,propsRef 存最新 props,
 * 事件回调从 propsRef 读,避免每次 prop 变化重建整张图。
 */
import { useEffect, useRef } from "react";
import cytoscape, {
  type Core,
  type ElementDefinition,
  type StylesheetJsonBlock,
} from "cytoscape";
import type { ForceParams, Pt } from "../lib/graph-layout";
import type { LayoutMode } from "../lib/graph-modes";
import {
  baseBgResolved,
  edgeColorResolved,
  labelColorResolved,
  nodeRingStyle,
  nodeVisualState,
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
  /** 布局坐标(父组件种子 / warm 落盘回填)。 */
  x?: number;
  y?: number;
  /** 钉住(用户 pin / 拖拽后)。 */
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
  /** 递增 = 重新施力 + reheat(Recalculate / 滑条变化 / 模式切回 force)。 */
  forcesToken: number;
  /** 簇→颜色映射;缺省按类型上色。 */
  clusterColors?: Map<string, ClusterColor>;
  themeIsDark?: boolean;
  /** 无向邻接表,悬停时高亮邻居。 */
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

const PAD = 30;

/** 节点视觉状态 → 字符串(供 stylesheet 选择器 / 映射)。 */
function stateOf(n: GraphNodeInput): string {
  return nodeVisualState({
    isCurrent: n.isCurrent,
    isSelected: n.isSelected,
    isMissing: n.isMissing,
    isGhost: n.isGhost,
  });
}

/** 节点填充色:簇色优先,否则按类型。 */
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

/** 把 GraphNodeInput/GraphLinkInput 映射成 Cytoscape 元素定义。 */
function buildElements(
  data: { nodes: GraphNodeInput[]; links: GraphLinkInput[] },
  clusterColors: Map<string, ClusterColor> | undefined,
  themeIsDark: boolean | undefined,
): ElementDefinition[] {
  const nodes: ElementDefinition[] = data.nodes.map((n) => {
    const ring = nodeRingStyle(stateOf(n) as ReturnType<typeof nodeVisualState>);
    return {
      data: {
        id: String(n.id),
        label: n.title,
        degree: n.degree,
        type: n.type ?? "",
        fill: nodeFill(n, clusterColors, themeIsDark),
        // 尺寸常量与 demo 批准版本一致(直径,px);按度数开方亚线性放大。
        size: 12 + Math.sqrt(Math.max(0, n.degree)) * 6,
        ringColor: ring.ringColor,
        ringWidth: ring.ringWidth,
        isMissing: n.isMissing ? "1" : undefined,
        isGhost: n.isGhost ? "1" : undefined,
      },
      position:
        n.x != null && n.y != null ? { x: n.x, y: n.y } : undefined,
    };
  });
  const edges: ElementDefinition[] = data.links.map((l, i) => ({
    data: {
      id: "e" + i,
      source: String(l.source),
      target: String(l.target),
      kind: l.kind,
    },
  }));
  return [...nodes, ...edges];
}

/** 构建 stylesheet(颜色经 CSS 变量,主题切换时重建即可)。 */
function buildStylesheet(): StylesheetJsonBlock[] {
  const edgeBase = edgeColorResolved("wiki", false);
  const edgeRel = edgeColorResolved("relation", false);
  const unresolved = unresolvedColorResolved();
  return [
    {
      selector: "node",
      style: {
        "background-color": "data(fill)",
        width: "data(size)",
        height: "data(size)",
        label: "data(label)",
        color: labelColorResolved(),
        "font-size": 10,
        "text-max-width": "90",
        "text-wrap": "wrap",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-outline-color": baseBgResolved(),
        "text-outline-width": 2.5,
        "border-color": "data(ringColor)",
        "border-width": "data(ringWidth)",
        "border-style": "solid",
        "border-opacity": 1,
      },
    },
    // 悬空目标桩:挖空填充 + 红虚边框。
    {
      selector: "node[isMissing]",
      style: { "background-color": baseBgResolved(), "border-style": "dashed" },
    },
    // 外部 ghost 桩:虚边框。
    { selector: "node[isGhost]", style: { "border-style": "dashed" } },
    // 悬停时被压暗的非邻居。
    { selector: 'node[dimmed]', style: { opacity: 0.18 } },
    {
      selector: "edge",
      style: {
        "line-color": edgeBase,
        "target-arrow-color": edgeBase,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.6,
        width: 0.8,
        "curve-style": "bezier",
        opacity: 0.55,
      },
    },
    {
      selector: 'edge[kind="relation"]',
      style: {
        "line-color": edgeRel,
        "target-arrow-color": edgeRel,
        width: 1.1,
      },
    },
    {
      selector: 'edge[kind="unresolved"]',
      style: {
        "line-color": unresolved,
        "target-arrow-color": unresolved,
        "line-style": "dashed",
        opacity: 0.7,
      },
    },
  ];
}

export function CytoscapeLayer(props: Props): React.ReactElement {
  const {
    graphData,
    width,
    height,
    forces,
    layoutMode,
    forcesToken,
    clusterColors,
    themeIsDark,
    fitToken,
    zoomToken,
    zoomFactor,
    flyTo,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  // 最新 props:事件回调读它,避免重建图。
  const propsRef = useRef(props);
  propsRef.current = props;
  // 本批数据是否有 warm 种子(决定 cose 是否全新散布)。
  const warmSeededRef = useRef(false);
  // 布局稳定回写节流句柄。
  const stableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 摄像机变换回调节流。
  const camTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // forcesToken 首次跳过(挂载时 graphData effect 已跑过一次布局)。
  const firstForcesToken = useRef(true);

  // ── 布局稳定回写(供父组件落盘) ─────────────────────────────────
  const emitPositions = () => {
    const cy = cyRef.current;
    if (!cy) return;
    if (stableTimer.current) return;
    stableTimer.current = setTimeout(() => {
      stableTimer.current = null;
      const m = new Map<number, Pt>();
      for (const n of cy.nodes()) {
        const p = n.position();
        m.set(Number(n.id()), { x: p.x, y: p.y });
      }
      propsRef.current.onPositionsStable?.(m);
    }, 400);
  };

  // ── 摄像机变换通知(节流) ───────────────────────────────────────
  const emitCamera = () => {
    const cy = cyRef.current;
    if (!cy) return;
    if (camTimer.current) return;
    camTimer.current = setTimeout(() => {
      camTimer.current = null;
      const pan = cy.pan();
      propsRef.current.onCameraTransform?.({ x: pan.x, y: pan.y, k: cy.zoom() });
    }, 80);
  };

  // ── 悬停高亮邻域(压暗非邻居) ───────────────────────────────────
  const hoverHighlight = (id: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    const adj = propsRef.current.adj;
    if (!adj) return;
    const neigh = adj.get(id);
    for (const n of cy.nodes()) {
      const nid = Number(n.id());
      const keep = nid === id || (neigh ? neigh.has(nid) : false);
      if (keep) n.removeData("dimmed");
      else n.data("dimmed", "1");
    }
  };
  const hoverClear = () => {
    const cy = cyRef.current;
    cy?.nodes().removeData("dimmed");
  };

  // ── 施力布局 ─────────────────────────────────────────────────────
  const runLayout = () => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;
    const mode = propsRef.current.layoutMode;
    const f = propsRef.current.forces;
    if (mode === "force") {
      const randomize = !warmSeededRef.current;
      cy.layout({
        name: "cose",
        animate: false,
        fit: true,
        padding: PAD,
        randomize,
        // 滑条→cose 参数映射:repel→斥力,linkDistance→理想边长,
        // linkStrength→弹性,center→重力。默认值与 demo 批准版本一致。
        nodeRepulsion: () => 7500 * Math.max(0, f.repel),
        idealEdgeLength: () => 95 * Math.max(0.1, f.linkDistance),
        edgeElasticity: () => 100 * Math.max(0, f.linkStrength),
        gravity: 0.3 * Math.max(0, f.center),
        numIter: 3000,
        nodeOverlap: 10,
        componentSpacing: 70,
        nestingFactor: 5,
      }).run();
      warmSeededRef.current = true; // 后续 forcesToken/滑条变化 = 微调,不再散布
    } else {
      // type-layer / timeline:GraphView 已把 n.x/n.y 设到元素 position,preset 直接落位。
      cy.nodes().positions((n) => {
        const src = propsRef.current.graphData.nodes.find(
          (nn) => String(nn.id) === n.id(),
        );
        return src && src.x != null && src.y != null
          ? { x: src.x, y: src.y }
          : n.position();
      });
      cy.fit(undefined, PAD);
    }
  };

  // ── 同步元素(结构变化:过滤/模型重建) ───────────────────────────
  const syncElements = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const data = propsRef.current.graphData;
    cy.elements().remove();
    cy.add(buildElements(data, propsRef.current.clusterColors, propsRef.current.themeIsDark));
    warmSeededRef.current = data.nodes.some((n) => n.x != null);
    runLayout();
  };

  // ── 主题/簇色变化 → 重算填充 + 重建 stylesheet ───────────────────
  const restyle = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const cc = propsRef.current.clusterColors;
    const dark = propsRef.current.themeIsDark;
    for (const n of cy.nodes()) {
      const src = propsRef.current.graphData.nodes.find(
        (nn) => String(nn.id) === n.id(),
      );
      if (src) n.data("fill", nodeFill(src, cc, dark));
    }
    cy.style(buildStylesheet());
  };

  // ── 同步每帧状态(选中/当前/焦点/ghost/missing → data 字段) ─────
  const syncStates = () => {
    const cy = cyRef.current;
    if (!cy) return;
    for (const n of cy.nodes()) {
      const src = propsRef.current.graphData.nodes.find(
        (nn) => String(nn.id) === n.id(),
      );
      if (!src) continue;
      const ring = nodeRingStyle(stateOf(src) as ReturnType<typeof nodeVisualState>);
      n.data({
        ringColor: ring.ringColor,
        ringWidth: ring.ringWidth,
        isMissing: src.isMissing ? "1" : undefined,
        isGhost: src.isGhost ? "1" : undefined,
      });
    }
  };

  // ── 挂载(一次性):建 Cytoscape + 接事件 ──────────────────────────
  useEffect(() => {
    if (!hostRef.current) return;
    const cy = cytoscape({
      container: hostRef.current,
      elements: [],
      style: buildStylesheet(),
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    cy.on("tap", "node", (e) => {
      const t = e.target;
      propsRef.current.onNodeClick(Number(t.id()));
    });
    cy.on("dbltap", "node", (e) => {
      propsRef.current.onNodeDoubleClick(Number(e.target.id()));
    });
    cy.on("cxttap", "node", (e) => {
      const o = e.originalEvent as MouseEvent;
      propsRef.current.onNodeRightClick(Number(e.target.id()), o.clientX, o.clientY);
    });
    cy.on("mouseover", "node", (e) => {
      const o = e.originalEvent as MouseEvent;
      const id = Number(e.target.id());
      hoverHighlight(id);
      propsRef.current.onNodeHover(id, o.clientX, o.clientY);
    });
    cy.on("mouseout", "node", () => {
      hoverClear();
      propsRef.current.onNodeHover(null);
    });
    cy.on("tap", (e) => {
      if (e.target === cy) propsRef.current.onBackgroundClick();
    });
    cy.on("dragfree", "node", (e) => {
      const p = e.target.position();
      propsRef.current.onNodeDragEnd(Number(e.target.id()), p.x, p.y, true);
      emitPositions();
    });
    cy.on("layoutstop", emitPositions);
    cy.on("boxend", () => {
      const ids = cy
        .nodes(":selected")
        .map((n) => Number(n.id()));
      if (ids.length > 0) propsRef.current.onBoxSelect(ids);
    });
    cy.on("pan zoom", emitCamera);

    // Shift 切换框选(与 rfg 版本同款交互):按住=框选,松开=平移。
    const onDown = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") cy.boxSelectionEnabled(true);
    };
    const onUp = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") cy.boxSelectionEnabled(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      if (stableTimer.current) clearTimeout(stableTimer.current);
      if (camTimer.current) clearTimeout(camTimer.current);
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 结构变化:重建元素 + 布局 ─────────────────────────────────────
  useEffect(() => {
    syncElements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  // ── 每帧状态同步(选中/当前等,就地字段变更) ─────────────────────
  useEffect(() => {
    syncStates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // ── 主题/簇色 → 重算填充 + 重建 stylesheet ───────────────────────
  useEffect(() => {
    restyle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeIsDark, clusterColors]);

  // ── 重新施力(Recalculate / 滑条 / 模式切回 force) ───────────────
  useEffect(() => {
    if (firstForcesToken.current) {
      firstForcesToken.current = false;
      return;
    }
    runLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcesToken, layoutMode, forces]);

  // ── fit ──────────────────────────────────────────────────────────
  useEffect(() => {
    cyRef.current?.fit(undefined, PAD);
  }, [fitToken]);

  // ── zoom(以视口中心为锚) ────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * zoomFactor, renderedPosition: { x: width / 2, y: height / 2 } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomToken]);

  // ── flyTo:把模型坐标 (x,y) 移到视口中心并设缩放 ──────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !flyTo) return;
    const zoom = flyTo.zoom;
    cy.animate({
      pan: { x: width / 2 - flyTo.x * zoom, y: height / 2 - flyTo.y * zoom },
      zoom,
      duration: 400,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  // ── 尺寸变化 → 通知 Cytoscape 重算视口 ────────────────────────────
  useEffect(() => {
    cyRef.current?.resize();
  }, [width, height]);

  return <div ref={hostRef} style={{ width, height }} />;
}
