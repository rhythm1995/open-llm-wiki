/**
 * tabs.ts —— 多标签编辑器的纯状态机(F-TABS 的可测核心)。
 *
 * 状态只有两块:open(标签页顺序的路径数组)+ active(当前激活路径,可为 null)。
 * 所有动作(open / activate / close / closeOthers / closeAll / reorder)都是纯函数,
 * 不碰 IO;真正读盘加载内容由 store 在拿到新 active 后处理。
 *
 * 关键约定:关闭当前激活页时,激活"右侧邻居";若右侧无人则回退左侧;都无则空。
 * 这是编辑器类应用的常见心智(CM/VSCode 关闭后跳到下一个)。
 */

export interface TabState {
  open: string[];
  active: string | null;
}

export type TabAction =
  | { type: "open"; path: string }
  | { type: "activate"; path: string }
  | { type: "close"; path: string }
  | { type: "closeOthers"; path: string }
  | { type: "closeAll" }
  | { type: "reorder"; from: number; to: number }
  | { type: "cycle"; direction: 1 | -1 };

export function tabReduce(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "open": {
      if (state.open.includes(action.path)) {
        return { ...state, active: action.path };
      }
      return { open: [...state.open, action.path], active: action.path };
    }
    case "activate": {
      if (!state.open.includes(action.path)) return state;
      return { ...state, active: action.path };
    }
    case "close": {
      const idx = state.open.indexOf(action.path);
      if (idx === -1) return state;
      const next = state.open.filter((p) => p !== action.path);
      let active = state.active;
      if (state.active === action.path) {
        active = next[idx] ?? next[idx - 1] ?? null;
      }
      return { open: next, active };
    }
    case "closeOthers": {
      if (!state.open.includes(action.path)) return { open: [], active: null };
      return { open: [action.path], active: action.path };
    }
    case "closeAll":
      return { open: [], active: null };
    case "reorder": {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0 || from >= state.open.length) return state;
      const next = [...state.open];
      const [moved] = next.splice(from, 1);
      next.splice(Math.min(to, next.length), 0, moved);
      return { ...state, open: next };
    }
    case "cycle": {
      // 循环切换激活页:direction +1 下一个、-1 上一个,到头/尾环回。
      // 无打开页 → 不动;active 缺失/不在列表 → 落到首个(有确定落点,不返回 null)。
      const n = state.open.length;
      if (n === 0) return state;
      const cur = state.active;
      if (cur == null || !state.open.includes(cur)) {
        return { ...state, active: state.open[0] };
      }
      const idx = state.open.indexOf(cur);
      const ni = (idx + action.direction + n) % n;
      return { ...state, active: state.open[ni] };
    }
    default:
      return state;
  }
}
