/**
 * edit-mode-ux —— 双模切换文案/提示纯逻辑(B-ED-MODE-UX)。
 */
import type { EditMode } from "./edit-mode";

/** 是否应在切换时展示保真/风险提示。 */
export function shouldShowModeFidelityHint(
  from: EditMode,
  to: EditMode,
): boolean {
  // 离开 source 进入 wysiwyg 时提示可能有损。
  return from === "source" && to === "wysiwyg";
}

/**
 * i18n key for hint(调用方 t())。
 * null = 无需提示。
 */
export function modeFidelityHintKey(
  from: EditMode,
  to: EditMode,
): string | null {
  if (!shouldShowModeFidelityHint(from, to)) return null;
  return "editor.mode.fidelityHint";
}

/** 模式显示标签的 i18n key。 */
export function editModeLabelKey(mode: EditMode): string {
  return mode === "wysiwyg" ? "editor.toWysiwyg" : "editor.toSource";
}
