/**
 * ColResizeHandle —— 栏宽拖拽手柄(B-COL-RESIZE)。
 *
 * 渲染成一个**零宽**的 flex 子元素,内部用绝对定位铺一块 7px 的命中区,跨在
 * 相邻两栏的接缝上(±3px)。零宽 + 绝对,故不会被相邻栏的 `overflow` 裁掉,
 * 也不占布局空间——视觉上仍是原来那条 border。
 *
 * `side="right"`:内容在左、border 在右(导航/列表),向右拖变宽;
 * `side="left"`:内容在右、border 在左(右栏),向左拖变宽。
 */


/** 栏宽夹紧:不低于 min;有 max 时不超过 max。 */
export function clampColWidth(raw: number, min: number, max?: number): number {
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, raw));
}

/** 一次拖拽位移 → 新栏宽。`side="right"` 向右变宽;`"left"` 向左变宽。 */
export function colWidthFromDrag(
  startW: number,
  startX: number,
  clientX: number,
  side: "left" | "right",
  min: number,
  max?: number,
): number {
  const dir = side === "right" ? 1 : -1;
  return clampColWidth(
    Math.round(startW + (clientX - startX) * dir),
    min,
    max,
  );
}

export function ColResizeHandle({
  width,
  min,
  max,
  side,
  onChange,
}: {
  width: number;
  min: number;
  /** 可选拖拽上限(右栏用:窗口宽 - 其余栏最小值 - 编辑器保底,防拖到过宽挤死编辑器)。 */
  max?: number;
  side: "left" | "right";
  onChange: (w: number) => void;
}) {
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => {
      onChange(colWidthFromDrag(startW, startX, ev.clientX, side, min, max));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="relative w-0 shrink-0 self-stretch">
      <div
        data-testid="col-resize-handle"
        data-side={side}
        onMouseDown={onDown}
        // 细灰高亮,不抢眼(命中区 4px 跨接缝,hover 显中性灰)。
        className="absolute -left-[2px] top-0 z-30 h-full w-[4px] cursor-col-resize hover:bg-overlay/40"
      />
    </div>
  );
}

/** 常用栏宽约束(最小值 / 默认值),供 App 与工具栏表头共用。
 *
 * `right` 是聊天面板(气泡对话 + composer),248 太窄会被遮挡看不到输入输出;
 * `editor` 是唯一 flex 栏,给它保底,右栏拖拽 / 窗口收缩时不得吃掉。 */
export const COL = {
  nav: { min: 176, default: 224 },
  list: { min: 208, default: 320 },
  right: { min: 340, default: 400 },
  editor: { min: 320 },
} as const;
