/**
 * nav-history —— 笔记导航历史(后退/前进)的纯栈运算(无 IO、无 React)。
 *
 * 浏览器式历史:每次「从 current 跳到 next」时,current 入 back 栈、forward 清空
 * (新分支截断旧 forward,与浏览器一致)。后退把 back 栈顶弹为新 current、旧 current
 * 入 forward;前进对称。current 为 null(无选中)时跳过对应入栈。
 *
 * 纯函数:返回新对象,不就地修改入参;便于在 store 里用 ref 持有 + 单测覆盖。
 */
export interface NavHistory {
  back: string[];
  forward: string[];
}

export const emptyHistory: NavHistory = { back: [], forward: [] };

/**
 * 记录一次「current → next」导航。current 与 next 相同时原样返回(无移动不污染历史)。
 * 否则 current(非 null)入 back 栈,forward 清空(新分支)。
 */
export function recordNavigation(
  hist: NavHistory,
  current: string | null,
  next: string,
): NavHistory {
  if (current === next) return hist;
  const back = current ? [...hist.back, current] : hist.back;
  return { back, forward: [] };
}

/** 后退:弹出 back 栈顶作为目标,旧 current 入 forward。无可后退返回 null。 */
export function navigateBack(
  hist: NavHistory,
  current: string | null,
): [NavHistory, string] | null {
  if (hist.back.length === 0) return null;
  const back = [...hist.back];
  const target = back.pop()!;
  const forward = current ? [...hist.forward, current] : hist.forward;
  return [{ back, forward }, target];
}

/** 前进:弹出 forward 栈顶作为目标,旧 current 入 back。无可前进返回 null。 */
export function navigateForward(
  hist: NavHistory,
  current: string | null,
): [NavHistory, string] | null {
  if (hist.forward.length === 0) return null;
  const forward = [...hist.forward];
  const target = forward.pop()!;
  const back = current ? [...hist.back, current] : hist.back;
  return [{ back, forward }, target];
}
