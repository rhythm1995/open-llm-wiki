/**
 * graph-style —— 节点/边颜色、尺寸与视觉状态(纯函数,渲染器中立)。
 *
 * 2026-08 视觉语言:对齐 OpenWiki 探索气质 —— 暗画布、克制色相、统一 accent 高亮;
 * 不再用 Catppuccin 彩虹满屏。CSS 变量可覆盖;失败回落 hex。
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

/**
 * 类型 → 填充色(低饱和、同系冷暖)。
 * 默认值刻意对齐 OpenWiki 调色板气质,而非 Catppuccin 糖果色。
 */
export function typeColorResolved(type: string | null): string {
  switch (type) {
    case "Source":
      return cssColor("--graph-type-source", "#D4B56A");
    case "Concept":
      return cssColor("--graph-type-concept", "#B4A0E0");
    case "Entity":
      return cssColor("--graph-type-entity", "#5EC4B6");
    case "Summary":
      return cssColor("--graph-type-summary", "#7BC47F");
    case "Note":
      return cssColor("--graph-type-note", "#7FC8FF");
    case "Query":
      return cssColor("--graph-type-query", "#C78EAD");
    default:
      return cssColor("--graph-type-default", "#6B8299");
  }
}

/** 画布背景(图空间,略深于 app base)。 */
export function graphCanvasBgResolved(): string {
  if (isDarkTheme()) {
    return cssColor("--graph-canvas-bg", "#050a16");
  }
  return cssColor("--graph-canvas-bg-light", "#EAF5FF");
}

/** 邻域/粒子/选中统一高亮色。 */
export function graphAccentResolved(): string {
  return cssColor("--graph-accent", "#7FC8FF");
}

export function edgeColorResolved(
  kind: "wiki" | "relation",
  hot: boolean,
): string {
  if (hot) return graphAccentResolved();
  // 浅色图底用更深灰蓝;深色图底用略亮的边,避免「看不见线」。
  if (kind === "relation") {
    const base = isDarkTheme()
      ? cssColor("--graph-edge-relation", "#9B8EC4")
      : cssColor("--graph-edge-relation-light", "#6B5B95");
    return colorWithAlpha(base, isDarkTheme() ? 0.85 : 0.7);
  }
  const base = isDarkTheme()
    ? cssColor("--graph-edge", "#4A6078")
    : cssColor("--graph-edge-light", "#5B7086");
  return colorWithAlpha(base, isDarkTheme() ? 0.75 : 0.55);
}

export function clusterColorResolved(): string {
  return graphAccentResolved();
}

export function baseBgResolved(): string {
  return graphCanvasBgResolved();
}

export function labelColorResolved(): string {
  if (isDarkTheme()) {
    return cssColor("--graph-label", "#8CA3BD");
  }
  return cssColor("--graph-label-light", "#3D5166");
}

export function unresolvedColorResolved(): string {
  return cssColor("--graph-unresolved", "#B27D75");
}

export function pinColorResolved(): string {
  return graphAccentResolved();
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

/**
 * 节点渲染半径(图空间):按度数开方亚线性。
 * 基础 4 保证叶子可见;系数 1.8 让 hub 更大但不爆炸。
 */
export function nodeSizeFromDegree(deg: number): number {
  // 收紧半径:避免 glow+大核把边盖成一坨;hub 仍可辨。
  return 3.2 + Math.sqrt(Math.max(0, deg)) * 1.25;
}

/** 给 #rgb/#rrggbb 或已是 rgba 的颜色叠透明度(邻域压暗 / glow)。 */
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
  isMissing?: boolean;
  isSelected?: boolean;
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
        ringColor: "#FFFFFF",
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
        ringColor: graphAccentResolved(),
        ringWidth: 1.6,
        dashed: false,
        ringAlpha: 0.95,
      };
    case "external":
      return {
        ringColor: cssColor("--graph-type-default", "#6B8299"),
        ringWidth: 1,
        dashed: true,
        ringAlpha: 0.55,
      };
    case "normal":
    default:
      return { ringColor: "transparent", ringWidth: 0, dashed: false, ringAlpha: 0 };
  }
}
