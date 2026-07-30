/**
 * GraphSigmaLayer —— sigma.js WebGL 图谱层(MIT)。
 *
 * 职责:挂载 Sigma、同步 graphology、转发交互。
 * 布局坐标由父组件(Worker FR / Barnes-Hut)写入。
 *
 * 交互与 SVG 对齐:
 * - 点击 / 双击 / 右键节点
 * - 拖拽节点(结束后回调,父级 pin)
 * - Shift+拖 框选
 * - 滚轮缩放(sigma 自带)+ 外部 zoomToken
 * - 簇点击 → 相机飞入展开 LOD
 */
import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import type { SigmaNodeAttrs } from "../lib/graph-webgl";
import {
  baseBgResolved,
  edgeColorResolved,
  labelColorResolved,
  unresolvedColorResolved,
} from "../lib/graph-webgl";

export interface SigmaEdgeInput {
  key: string;
  source: string;
  target: string;
  kind: "wiki" | "relation" | "unresolved";
  hot?: boolean;
  weight?: number;
}

interface Props {
  nodes: Map<string, SigmaNodeAttrs>;
  edges: SigmaEdgeInput[];
  structureKey: string;
  width: number;
  height: number;
  onNodeClick: (
    nodeId: number,
    isCluster: boolean,
    memberIds?: number[],
    clusterCenter?: { x: number; y: number },
  ) => void;
  onNodeDoubleClick: (nodeId: number) => void;
  onNodeRightClick: (nodeId: number, x: number, y: number) => void;
  onNodeEnter: (nodeId: number, x: number, y: number) => void;
  onNodeLeave: () => void;
  onBackgroundClick: () => void;
  /** 拖拽节点:图坐标;moved=是否发生位移。 */
  onNodeDragEnd?: (nodeId: number, x: number, y: number, moved: boolean) => void;
  /** 框选命中的业务 nodeId 列表。 */
  onBoxSelect?: (nodeIds: number[]) => void;
  onCameraRatio?: (ratio: number) => void;
  fitToken: number;
  /** 外部缩放:每次 token++ 按 factor 缩放(相对当前相机)。 */
  zoomToken?: number;
  zoomFactor?: number;
  /** 飞入图坐标中心(簇展开)。 */
  flyTo?: { x: number; y: number; ratio: number; token: number } | null;
}

export function GraphSigmaLayer({
  nodes,
  edges,
  structureKey,
  width,
  height,
  onNodeClick,
  onNodeDoubleClick,
  onNodeRightClick,
  onNodeEnter,
  onNodeLeave,
  onBackgroundClick,
  onNodeDragEnd,
  onBoxSelect,
  onCameraRatio,
  fitToken,
  zoomToken = 0,
  zoomFactor = 1,
  flyTo = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const dragRef = useRef<{
    key: string;
    nodeId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const boxRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const boxElRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef({
    onNodeClick,
    onNodeDoubleClick,
    onNodeRightClick,
    onNodeEnter,
    onNodeLeave,
    onBackgroundClick,
    onNodeDragEnd,
    onBoxSelect,
    onCameraRatio,
  });
  cbRef.current = {
    onNodeClick,
    onNodeDoubleClick,
    onNodeRightClick,
    onNodeEnter,
    onNodeLeave,
    onBackgroundClick,
    onNodeDragEnd,
    onBoxSelect,
    onCameraRatio,
  };

  // 挂载 / 卸载 Sigma。
  useEffect(() => {
    const el = hostRef.current;
    if (!el || width <= 0 || height <= 0) return;

    const graph = new Graph({
      type: "undirected",
      multi: true,
      allowSelfLoops: false,
    });
    graphRef.current = graph;

    const sigma = new Sigma(graph, el, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 11,
      labelWeight: "500",
      labelColor: { color: labelColorResolved() },
      defaultEdgeColor: edgeColorResolved("wiki", false),
      defaultNodeColor: "#89b4fa",
      stagePadding: 40,
      minCameraRatio: 0.05,
      maxCameraRatio: 10,
    });
    el.style.background = baseBgResolved();
    el.style.position = "relative";
    sigmaRef.current = sigma;

    // 框选层。
    const boxEl = document.createElement("div");
    boxEl.style.cssText =
      "position:absolute;pointer-events:none;border:1px solid rgba(30,102,245,0.85);background:rgba(30,102,245,0.12);display:none;z-index:5;";
    el.appendChild(boxEl);
    boxElRef.current = boxEl;

    sigma.on("clickNode", ({ node, event }) => {
      if (dragRef.current?.moved) return;
      event.preventSigmaDefault();
      const attrs = graph.getNodeAttributes(node) as SigmaNodeAttrs;
      if (attrs.isGhost) return;
      if (attrs.isCluster) {
        cbRef.current.onNodeClick(-1, true, attrs.memberIds, {
          x: attrs.clusterX ?? attrs.x,
          y: attrs.clusterY ?? attrs.y,
        });
      } else {
        cbRef.current.onNodeClick(attrs.nodeId, false);
      }
    });
    sigma.on("doubleClickNode", ({ node, event }) => {
      event.preventSigmaDefault();
      const attrs = graph.getNodeAttributes(node) as SigmaNodeAttrs;
      if (!attrs.isCluster && !attrs.isGhost) {
        cbRef.current.onNodeDoubleClick(attrs.nodeId);
      }
    });
    sigma.on("rightClickNode", ({ node, event }) => {
      event.original.preventDefault();
      event.preventSigmaDefault();
      const attrs = graph.getNodeAttributes(node) as SigmaNodeAttrs;
      if (!attrs.isCluster && !attrs.isGhost) {
        const oe = event.original as MouseEvent;
        cbRef.current.onNodeRightClick(attrs.nodeId, oe.clientX, oe.clientY);
      }
    });
    sigma.on("enterNode", ({ node }) => {
      const attrs = graph.getNodeAttributes(node) as SigmaNodeAttrs;
      if (attrs.isCluster || attrs.isGhost) return;
      const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
      const rect = el.getBoundingClientRect();
      cbRef.current.onNodeEnter(
        attrs.nodeId,
        rect.left + vp.x,
        rect.top + vp.y,
      );
    });
    sigma.on("leaveNode", () => {
      cbRef.current.onNodeLeave();
    });

    sigma.on("downNode", ({ node, event }) => {
      const attrs = graph.getNodeAttributes(node) as SigmaNodeAttrs;
      if (attrs.isCluster || attrs.isGhost) return;
      // Shift 留给框选,不拖节点。
      if ((event.original as MouseEvent).shiftKey) return;
      event.preventSigmaDefault();
      dragRef.current = {
        key: node,
        nodeId: attrs.nodeId,
        startX: attrs.x,
        startY: attrs.y,
        moved: false,
      };
      // 拖节点时禁用相机平移。
      sigma.getCamera().disable();
    });

    sigma.on("moveBody", ({ event }) => {
      const d = dragRef.current;
      if (d) {
        event.preventSigmaDefault();
        const coords = sigma.viewportToGraph({
          x: event.x,
          y: event.y,
        });
        if (
          Math.hypot(coords.x - d.startX, coords.y - d.startY) > 1.5
        ) {
          d.moved = true;
        }
        graph.setNodeAttribute(d.key, "x", coords.x);
        graph.setNodeAttribute(d.key, "y", coords.y);
        sigma.refresh();
        return;
      }
      const box = boxRef.current;
      if (box) {
        event.preventSigmaDefault();
        box.x1 = event.x;
        box.y1 = event.y;
        const left = Math.min(box.x0, box.x1);
        const top = Math.min(box.y0, box.y1);
        const w = Math.abs(box.x1 - box.x0);
        const h = Math.abs(box.y1 - box.y0);
        if (boxElRef.current) {
          const elBox = boxElRef.current;
          elBox.style.display = "block";
          elBox.style.left = `${left}px`;
          elBox.style.top = `${top}px`;
          elBox.style.width = `${w}px`;
          elBox.style.height = `${h}px`;
        }
      }
    });

    const endDragOrBox = () => {
      const d = dragRef.current;
      if (d) {
        const x = graph.getNodeAttribute(d.key, "x") as number;
        const y = graph.getNodeAttribute(d.key, "y") as number;
        cbRef.current.onNodeDragEnd?.(d.nodeId, x, y, d.moved);
        dragRef.current = null;
        sigma.getCamera().enable();
      }
      const box = boxRef.current;
      if (box) {
        boxRef.current = null;
        if (boxElRef.current) boxElRef.current.style.display = "none";
        const x0 = Math.min(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1);
        const x1 = Math.max(box.x0, box.x1);
        const y1 = Math.max(box.y0, box.y1);
        if (x1 - x0 > 4 || y1 - y0 > 4) {
          const hits: number[] = [];
          graph.forEachNode((_key, attrs) => {
            const a = attrs as SigmaNodeAttrs;
            if (a.isCluster || a.isGhost) return;
            const vp = sigma.graphToViewport({ x: a.x, y: a.y });
            if (vp.x >= x0 && vp.x <= x1 && vp.y >= y0 && vp.y <= y1) {
              hits.push(a.nodeId);
            }
          });
          cbRef.current.onBoxSelect?.(hits);
        }
        sigma.getCamera().enable();
      }
    };

    sigma.on("upNode", () => endDragOrBox());
    sigma.on("upStage", () => endDragOrBox());

    sigma.on("downStage", ({ event }) => {
      const me = event.original as MouseEvent;
      if (me.shiftKey) {
        event.preventSigmaDefault();
        boxRef.current = {
          x0: event.x,
          y0: event.y,
          x1: event.x,
          y1: event.y,
        };
        sigma.getCamera().disable();
        return;
      }
    });

    sigma.on("clickStage", ({ event }) => {
      if (dragRef.current?.moved) return;
      event.preventSigmaDefault();
      cbRef.current.onBackgroundClick();
    });

    sigma.getCamera().on("updated", (state) => {
      cbRef.current.onCameraRatio?.(state.ratio);
    });

    return () => {
      boxEl.remove();
      boxElRef.current = null;
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width > 0 && height > 0]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma || width <= 0 || height <= 0) return;
    const el = hostRef.current;
    if (el) {
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
    }
    sigma.resize();
  }, [width, height]);

  // 结构 + 属性同步(拖拽中跳过位置覆盖,避免抖动)。
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;
    if (dragRef.current) return;

    const wantNodes = new Set(nodes.keys());
    for (const key of graph.nodes()) {
      if (!wantNodes.has(key)) graph.dropNode(key);
    }
    for (const [key, attrs] of nodes) {
      if (graph.hasNode(key)) {
        graph.mergeNodeAttributes(key, {
          x: attrs.x,
          y: attrs.y,
          size: attrs.size,
          label: attrs.label,
          color: attrs.color,
          forceLabel: attrs.forceLabel,
          highlighted: attrs.highlighted,
          nodeId: attrs.nodeId,
          isCluster: attrs.isCluster,
          isGhost: attrs.isGhost,
          memberIds: attrs.memberIds,
          clusterX: attrs.clusterX,
          clusterY: attrs.clusterY,
        });
      } else {
        graph.addNode(key, { ...attrs });
      }
    }

    for (const key of graph.edges()) graph.dropEdge(key);
    for (const e of edges) {
      if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
      try {
        const weight = e.weight ?? 1;
        const size =
          e.kind === "unresolved"
            ? 0.6
            : (e.hot ? 1.6 : e.kind === "relation" ? 1.1 : 0.7) *
              Math.min(2.5, 1 + Math.log2(weight));
        const color =
          e.kind === "unresolved"
            ? unresolvedColorResolved()
            : edgeColorResolved(e.kind, !!e.hot);
        graph.addEdgeWithKey(e.key, e.source, e.target, {
          size,
          color,
          kind: e.kind,
        });
      } catch {
        // key 冲突跳过
      }
    }
    sigma.refresh();
  }, [nodes, edges, structureKey]);

  useEffect(() => {
    if (fitToken === 0) return;
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph || graph.order === 0) return;
    sigma.getCamera().animatedReset({ duration: 250 });
  }, [fitToken]);

  useEffect(() => {
    if (!zoomToken || zoomFactor === 1) return;
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const cam = sigma.getCamera();
    const cur = cam.getState();
    const next = Math.max(
      0.05,
      Math.min(10, cur.ratio / zoomFactor),
    );
    cam.animate({ ...cur, ratio: next }, { duration: 160 });
  }, [zoomToken, zoomFactor]);

  useEffect(() => {
    if (!flyTo || flyTo.token === 0) return;
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.getCamera().animate(
      { x: flyTo.x, y: flyTo.y, ratio: flyTo.ratio, angle: 0 },
      { duration: 320 },
    );
  }, [flyTo]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full"
      style={{ width, height }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
