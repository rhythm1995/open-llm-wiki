/**
 * move-path —— 笔记拖拽移动的纯路径逻辑(无 IO)。
 *
 * 把 `from` 移到目标目录 `targetDir`(空串 = vault 根)。只改目录段,文件名不变。
 * 返回 null 表示非法/无变化(同目录、空 from、目标等于自身等)。
 */

/** 取路径的目录段;根文件 → ""。 */
export function pathDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** 取路径末段文件名。 */
export function pathBase(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/**
 * 计算移动后的相对路径。
 * @param from 源相对路径(含文件名,如 `a/b.md`)
 * @param targetDir 目标目录(空串 = 根;`notes` / `notes/inbox`)
 */
export function resolveMoveTarget(from: string, targetDir: string): string | null {
  const src = from.replace(/^\/+|\/+$/g, "");
  if (!src) return null;
  const base = pathBase(src);
  if (!base) return null;
  const dir = targetDir.replace(/^\/+|\/+$/g, "");
  // 禁止把文件拖进自己的路径前缀(把自己当目录)。
  if (dir === src || dir.startsWith(`${src}/`)) return null;
  const to = dir ? `${dir}/${base}` : base;
  if (to === src) return null;
  return to;
}
