/**
 * Agent 品牌小标 —— 使用 `public/agent-icons/` 下的**官方 / brand-pack 矢量**,
 * 不用手绘几何标。溯源见 `ui/public/agent-icons/SOURCES.md`。
 *
 * 渲染:圆角底色 + CSS mask 套官方 SVG path(currentColor 单色标)。
 */
import type { CSSProperties } from "react";
import { cn } from "./cn";

export type AgentIconProps = {
  /** agent id,如 claude-code / cursor / grok-build。 */
  id: string;
  size?: number;
  className?: string;
  /** 仅蒙版字形、无圆底。 */
  bare?: boolean;
};

type Mark = {
  /** public/agent-icons 文件名(无 .svg) */
  file: string;
  /** 圆底品牌色 */
  bg: string;
  /** 前景(标本身)色 */
  fg: string;
};

function normalizeAgentId(id: string): string {
  const k = id.trim().toLowerCase();
  if (k === "claude" || k.startsWith("claude-")) return "claude";
  if (k === "cursor" || k.startsWith("cursor-")) return "cursor";
  if (k === "opencode" || k === "open-code") return "opencode";
  if (k === "codex" || k.startsWith("codex-") || k === "openai") return "codex";
  if (k === "windsurf") return "windsurf";
  if (k === "zed") return "zed";
  if (k === "grok" || k.startsWith("grok-")) return "grok";
  if (k === "pi") return "pi";
  return k;
}

/**
 * 品牌色:尽量贴近各家公开 brand / simple-icons hex。
 * 矢量文件本身仍是官方 path,不在此重画。
 */
const MARKS: Record<string, Mark> = {
  claude: { file: "claude", bg: "#D97757", fg: "#FFF7F3" },
  cursor: { file: "cursor", bg: "#000000", fg: "#FFFFFF" },
  opencode: { file: "opencode", bg: "#131010", fg: "#FFFFFF" },
  codex: { file: "codex", bg: "#10A37F", fg: "#FFFFFF" },
  windsurf: { file: "windsurf", bg: "#0B100F", fg: "#FFFFFF" },
  zed: { file: "zed", bg: "#084CCF", fg: "#FFFFFF" },
  grok: { file: "grok", bg: "#000000", fg: "#FFFFFF" },
  pi: { file: "pi", bg: "#09090b", fg: "#FFFFFF" },
};

const FALLBACK: Mark = {
  file: "",
  bg: "var(--color-blue, #3b82f6)",
  fg: "#ffffff",
};

function iconUrl(file: string): string {
  // Vite public/ → 站点根路径
  return `/agent-icons/${file}.svg`;
}

/** 按 agent id 渲染官方矢量小标(默认 16px 圆角方标)。 */
export function AgentIcon({
  id,
  size = 16,
  className,
  bare = false,
}: AgentIconProps) {
  const key = normalizeAgentId(id);
  const mark = MARKS[key] ?? FALLBACK;
  const hasFile = Boolean(mark.file);
  const glyph = Math.max(10, Math.round(size * 0.62));

  const maskStyle: CSSProperties | undefined = hasFile
    ? {
        width: bare ? size : glyph,
        height: bare ? size : glyph,
        backgroundColor: mark.fg,
        WebkitMaskImage: `url(${iconUrl(mark.file)})`,
        maskImage: `url(${iconUrl(mark.file)})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }
    : undefined;

  const glyphEl = hasFile ? (
    <span style={maskStyle} aria-hidden />
  ) : (
    <svg
      width={bare ? size : glyph}
      height={bare ? size : glyph}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <circle cx="12" cy="9" r="3.2" fill={mark.fg} />
      <path
        fill={mark.fg}
        d="M6.5 18.2c.6-3.1 2.9-4.7 5.5-4.7s4.9 1.6 5.5 4.7"
        opacity="0.95"
      />
    </svg>
  );

  if (bare) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        data-agent-icon={key}
      >
        {glyphEl}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[5px]",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: mark.bg,
      }}
      aria-hidden
      data-agent-icon={key}
      title={key}
    >
      {glyphEl}
    </span>
  );
}

/** 测试:是否有专用官方标文件映射。 */
export function hasAgentMark(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MARKS, normalizeAgentId(id));
}
