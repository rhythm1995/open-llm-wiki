/**
 * graph-style —— 节点/边的颜色、尺寸与视觉状态(纯函数,渲染器中立)。
 *
 * canvas-2D 与(过渡期的)sigma/WebGL 共用同一套取色/尺寸逻辑。CSS 变量从 document 读,
 * 失败回落 fallback(便于压暗/描边等后处理落到具体颜色值)。
 * 节点视觉状态(active/missing/selected/external)决定是否画描边环及环样式,
 * 让 canvas 渲染器复刻 inkeep 式的高亮/悬空/选中语义。
 */

/** 读 CSS 变量为颜色串;空则 fallback。 */
export function cssColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** 类型 → 颜色(与 SVG GraphView 语义一致)。 */
export function typeColorResolved(type: string | null): string {
  switch (type) {
    case "Source":
      return cssColor("--color-yellow", "#df8e1d");
    case "Concept":
      return cssColor("--color-mauve", "#8839ef");
    case "Entity":
      return cssColor("--color-teal", "#179299");
    case "Summary":
      return cssColor("--color-green", "#40a02b");
    case "Note":
      return cssColor("--color-blue", "#1e66f5");
    default:
      return cssColor("--color-overlay", "#9ca0b0");
  }
}

export function edgeColorResolved(
  kind: "wiki" | "relation",
  hot: boolean,
): string {
  if (hot) return cssColor("--color-blue", "#1e66f5");
  if (kind === "relation") return cssColor("--color-mauve", "#8839ef");
  return cssColor("--color-overlay", "#9ca0b0");
}

export function clusterColorResolved(): string {
  return cssColor("--color-blue", "#1e66f5");
}

export function baseBgResolved(): string {
  return cssColor("--color-base", "#1e1e2e");
}

export function labelColorResolved(): string {
  return cssColor("--color-text", "#cdd6f4");
}

export function unresolvedColorResolved(): string {
  return cssColor("--color-red", "#d20f39");
}

export function pinColorResolved(): string {
  return cssColor("--color-mauve", "#8839ef");
}

/**
 * 探测当前是否深色主题:读 --color-base 的亮度。
 * 簇色板按主题选 dark/light 槽位;CSS 变量取色本身已自适应,此处只决定槽位。
 * 非浏览器 / 解析失败 → 默认深色。
 */
export function isDarkTheme(): boolean {
  const bg = cssColor("--color-base", "#1e1e2e");
  const m = bg.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return true;
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5;
}

/** 节点渲染尺寸:按度数开方。 */
export function nodeSizeFromDegree(deg: number): number {
  return 3 + Math.sqrt(Math.max(0, deg)) * 2.2;
}

/** 给 #rgb/#rrggbb 或已是 rgba 的颜色叠透明度(邻域压暗)。 */
export function colorWithAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const rgba = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((s) => s.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
  }
  return color;
}

/**
 * 节点视觉状态。优先级:active(当前文档) > missing(悬空链接目标)
 * > selected(框选/选中) > external(ghost 桩) > normal。
 */
export type NodeVisualState =
  | "active"
  | "missing"
  | "selected"
  | "external"
  | "normal";

export function nodeVisualState(o: {
  isCurrent?: boolean;
  isSelected?: boolean;
  isMissing?: boolean;
  isGhost?: boolean;
}): NodeVisualState {
  if (o.isCurrent) return "active";
  if (o.isMissing) return "missing";
  if (o.isSelected) return "selected";
  if (o.isGhost) return "external";
  return "normal";
}

export interface NodeRingStyle {
  ringColor: string;
  ringWidth: number;
  dashed: boolean;
  ringAlpha: number;
}

/** 由视觉状态算描边环样式。normal → 不画(宽度 0)。 */
export function nodeRingStyle(state: NodeVisualState): NodeRingStyle {
  switch (state) {
    case "active":
      return {
        ringColor: cssColor("--color-blue", "#1e66f5"),
        ringWidth: 2,
        dashed: false,
        ringAlpha: 1,
      };
    case "missing":
      return {
        ringColor: unresolvedColorResolved(),
        ringWidth: 1.5,
        dashed: true,
        ringAlpha: 0.9,
      };
    case "selected":
      return {
        ringColor: cssColor("--color-mauve", "#8839ef"),
        ringWidth: 1.5,
        dashed: false,
        ringAlpha: 0.85,
      };
    case "external":
      return {
        ringColor: cssColor("--color-overlay", "#9ca0b0"),
        ringWidth: 1,
        dashed: true,
        ringAlpha: 0.5,
      };
    case "normal":
    default:
      return { ringColor: "transparent", ringWidth: 0, dashed: false, ringAlpha: 0 };
  }
}
