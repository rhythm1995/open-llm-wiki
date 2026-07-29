/**
 * canvas —— tldraw 画布的纯逻辑持久化层(F-CANVAS)。
 *
 * `.canvas` 文件存的是 tldraw 的 `TLEditorSnapshot` 序列化 JSON。本模块只负责
 * 字符串 ↔ 快照的 round-trip 与"这是不是一份画布"的判定,**不**触碰 tldraw
 * 运行时(故可在 node 单测里跑:tldraw 是重依赖,通过 `import type` 擦除)。
 *
 * 真正的 tldraw 挂载、`createTLStore`/`loadSnapshot`/`getSnapshot` 调用与
 * `store.listen` 防抖落盘都在 `CanvasView.tsx` 里(且 CanvasView 由 App 懒加载,
 * 把整个 tldraw bundle 隔离到独立 chunk —— 用户不开画布就不下载,也隔离了
 * tldraw 的非商用许可边界,见仓库根 THIRD_PARTY_NOTICES)。
 *
 * 选 `TLEditorSnapshot`(`{ document, session }`)而非 `TLStoreSnapshot`:
 * getSnapshot 返回的是前者,loadSnapshot 接受 `Partial<TLEditorSnapshot>`,
 * 两者正好闭环;session 段顺便保留相机/选区状态,体验更完整。
 */
import type { TLEditorSnapshot } from "tldraw";

/** 空画布文件内容(空串;新建 `.canvas` 即写空串)。 */
export function emptyCanvasContent(): string {
  return "";
}

/**
 * 把字符串解析为画布快照:null / 空白 / 非 JSON / 非对象 / 缺 `document` 字段
 * 一律判为"非画布"返回 null(由调用方退化为空白画布)。不深校验 schema ——
 * schema 合法性交给 tldraw 的 loadSnapshot;这里只挡掉明显不是快照的内容。
 */
export function parseCanvasContent(raw: string): TLEditorSnapshot | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const document = (parsed as { document?: unknown }).document;
  if (typeof document !== "object" || document === null) return null;
  return parsed as TLEditorSnapshot;
}

/** 把快照序列化为文件内容(美化 JSON,便于 diff / 肉眼审阅与 git 友好)。 */
export function serializeCanvasContent(snapshot: TLEditorSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/** 路径是否指向 `.canvas` 画布文件(供 App / Sidebar / Palette 路由分发)。 */
export function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith(".canvas");
}
