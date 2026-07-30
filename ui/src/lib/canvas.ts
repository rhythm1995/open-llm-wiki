/**
 * canvas —— 画布文件的纯逻辑持久化层(F-CANVAS,Excalidraw / MIT)。
 *
 * `.canvas` 存 OpenObsidian 自有 JSON schema(引擎 = Excalidraw),**不**依赖
 * 任何画布库的运行时类型 —— 可在 node 单测里跑。真正挂载在 `CanvasView.tsx`
 * (App 懒加载隔离大包)。
 *
 * 旧 tldraw 文件(`{ document, session }`)可识别但**不可编辑**(无官方映射);
 * UI 展示只读提示,磁盘文件保留。
 */

/** 磁盘 schema 版本标记。 */
export const CANVAS_SCHEMA_VERSION = 1 as const;
export const CANVAS_ENGINE = "excalidraw" as const;

/**
 * 落盘形态:Excalidraw elements + 精简 appState + 可选 files。
 * elements / files 结构由 Excalidraw 定义,此处用 unknown[] 避免运行时耦合。
 */
export interface OpenObsidianCanvas {
  openobsidianCanvas: typeof CANVAS_SCHEMA_VERSION;
  engine: typeof CANVAS_ENGINE;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** 空画布文件内容(空串;新建 `.canvas` 即写空串,首次编辑再落 schema)。 */
export function emptyCanvasContent(): string {
  return "";
}

/** 构造一份空白可编辑画布文档。 */
export function createEmptyCanvasDoc(): OpenObsidianCanvas {
  return {
    openobsidianCanvas: CANVAS_SCHEMA_VERSION,
    engine: CANVAS_ENGINE,
    elements: [],
    appState: {},
    files: {},
  };
}

/** 是否为历史 tldraw 快照(`TLEditorSnapshot` 形态)。 */
export function isLegacyTldrawCanvas(raw: string): boolean {
  if (!raw || !raw.trim()) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const o = parsed as Record<string, unknown>;
  // 新 schema 明确带 openobsidianCanvas,不算 legacy。
  if (o.openobsidianCanvas != null) return false;
  const document = o.document;
  return typeof document === "object" && document !== null;
}

/**
 * 解析为可编辑画布。null = 空白新画布;legacy = 旧 tldraw(调用方勿当可编辑)。
 * 返回 `'legacy'` 字面量与文档二选一。
 */
export function parseCanvasContent(
  raw: string,
): OpenObsidianCanvas | "legacy" | null {
  if (!raw || !raw.trim()) return null;
  if (isLegacyTldrawCanvas(raw)) return "legacy";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.openobsidianCanvas !== CANVAS_SCHEMA_VERSION) return null;
  if (o.engine !== CANVAS_ENGINE) return null;
  if (!Array.isArray(o.elements)) return null;
  const appState =
    typeof o.appState === "object" && o.appState !== null
      ? (o.appState as Record<string, unknown>)
      : {};
  const files =
    typeof o.files === "object" && o.files !== null
      ? (o.files as Record<string, unknown>)
      : {};
  return {
    openobsidianCanvas: CANVAS_SCHEMA_VERSION,
    engine: CANVAS_ENGINE,
    elements: o.elements as unknown[],
    appState,
    files,
  };
}

/** 序列化为美化 JSON(git 友好)。 */
export function serializeCanvasContent(doc: OpenObsidianCanvas): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * 从 Excalidraw onChange 载荷组装落盘文档。
 * 只保留可 JSON 化的 appState 子集,避免函数/DOM 引用污染文件。
 */
export function canvasDocFromExcalidraw(
  elements: readonly unknown[],
  appState: Record<string, unknown> | null | undefined,
  files: Record<string, unknown> | null | undefined,
): OpenObsidianCanvas {
  const safeState: Record<string, unknown> = {};
  if (appState) {
    // 持久化视图相关字段即可;collaborators 等运行时态丢掉。
    for (const key of [
      "viewBackgroundColor",
      "gridSize",
      "theme",
      "zoom",
      "scrollX",
      "scrollY",
    ] as const) {
      if (key in appState) safeState[key] = appState[key];
    }
  }
  return {
    openobsidianCanvas: CANVAS_SCHEMA_VERSION,
    engine: CANVAS_ENGINE,
    elements: elements.map((e) => e),
    appState: safeState,
    files: files ? { ...files } : {},
  };
}

/** 路径是否指向 `.canvas` 画布文件。 */
export function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith(".canvas");
}
