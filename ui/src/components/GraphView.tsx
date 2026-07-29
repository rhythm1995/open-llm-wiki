/**
 * GraphView —— 差异化之一:原生图谱视图(纯 SVG 力导向,无 d3 依赖)。
 *
 * 复刻 Obsidian 图谱的核心观感:节点按类型着色、按连接度变大小,边分 wiki/relation,
 * 当前笔记高亮,点击节点跳转。布局用极简 Fruchterman–Reingold:全对斥力 + 边弹簧 +
 * 向心引力,固定步数迭代(几百节点内瞬时完成)。
 *
 * 这是「功能参考 Obsidian、实现参考 Tolaria 的可视化取向但独立编写」的产物。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";

interface Props {
  snapshot: VaultSnapshot | null;
  currentId: number | null;
  actions: VaultActions;
}

const W = 900;
const H = 640;
const MAX_NODES = 400;

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
};
const colorFor = (type: string | null): string =>
  (type && TYPE_COLOR[type]) || "#6c7086";

export function GraphView({ snapshot, currentId, actions }: Props) {
  const [pts, setPts] = useState<Pt[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const sizeRef = useRef({ w: W, h: H });

  const nodes = snapshot?.nodes ?? [];
  const edges = snapshot?.edges ?? [];

  // 度数(用于节点大小 + 悬停信息)。
  const degree = useMemo(() => {
    const d = new Map<number, number>();
    for (const n of nodes) d.set(n.id, 0);
    for (const e of edges) {
      if (e.to == null) continue;
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [nodes, edges]);

  // 力导向布局:仅在节点集合变化时重算。
  useEffect(() => {
    const n = nodes.length;
    if (n === 0) {
      setPts([]);
      return;
    }
    const count = Math.min(n, MAX_NODES);
    const { w, h } = sizeRef.current;
    const k = Math.sqrt((w * h) / count) * 0.6;
    // 初始:圆环铺开,降低收敛到一团的风险。
    let pos: Pt[] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        x: w / 2 + (Math.cos(a) * w) / 3 + ((i * 37) % 50),
        y: h / 2 + (Math.sin(a) * h) / 3 + ((i * 53) % 50),
      };
    });
    const adj = new Map<number, number[]>();
    for (const e of edges) {
      if (e.to == null) continue;
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
    }
    let t = w / 8; // 温度
    const ITERS = 180;
    for (let it = 0; it < ITERS; it++) {
      const disp: Pt[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
      // 斥力(全对,O(n²);n≤400 可接受)。
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
      // 引力(沿边)。
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
      // 向心 + 应用位移(温度限幅)。
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
    setPts(pos.slice(0, count));
  }, [nodes, edges]);

  if (!snapshot || nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">图谱为空 —— 打开一个含链接的 vault。</p>
      </div>
    );
  }

  const truncated = nodes.length > MAX_NODES;

  return (
    <div className="relative h-full w-full bg-crust">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 边 */}
        <g stroke-opacity="0.35">
          {edges.map((e, i) => {
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
          {/* 悬空链接:画到目标文字标签(浮在左上角列表),这里用淡色短桩示意。 */}
          {edges
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
        {nodes.slice(0, MAX_NODES).map((node, i) => {
          const p = pts[i];
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
                <text
                  x={r + 3}
                  y={3}
                  fontSize={10}
                  fill="#cdd6f4"
                  className="select-none"
                >
                  {node.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-mantle/80 px-2 py-1 text-[11px] text-overlay">
        {nodes.length} 节点 · {edges.length} 边
        {truncated && <span className="text-red"> · 已截断至 {MAX_NODES}</span>}
      </div>
    </div>
  );
}
