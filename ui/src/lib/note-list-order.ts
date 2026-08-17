/**
 * 第二栏排序稳定:当前打开的笔记不因这次打开触发的 mtime 冲到顶部。
 * 选中时记下它在「按 modified 排」里的位置;在仍打开期间钉住该下标。
 */

export type ListPin = { path: string; index: number };

export function pinCurrentInList<T extends { path: string }>(
  items: T[],
  currentPath: string | null,
  prev: ListPin | null,
): { items: T[]; pin: ListPin | null } {
  if (!currentPath) return { items, pin: null };
  const idx = items.findIndex((n) => n.path === currentPath);
  if (idx < 0) return { items, pin: null };
  if (!prev || prev.path !== currentPath) {
    return { items, pin: { path: currentPath, index: idx } };
  }
  if (idx === prev.index) return { items, pin: prev };
  const next = items.slice();
  const [item] = next.splice(idx, 1);
  if (!item) return { items, pin: prev };
  const at = Math.min(Math.max(0, prev.index), next.length);
  next.splice(at, 0, item);
  return { items: next, pin: prev };
}
