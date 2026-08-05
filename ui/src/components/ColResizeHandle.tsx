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


export function ColResizeHandle({
  width,
  min,
  side,
  onChange,
}: {
  width: number;
  min: number;
  side: "left" | "right";
  onChange: (w: number) => void;
}) {
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const dir = side === "right" ? 1 : -1;
    const move = (ev: MouseEvent) => {
      const next = Math.max(min, Math.round(startW + (ev.clientX - startX) * dir));
      onChange(next);
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
        onMouseDown={onDown}
        // 细灰高亮,不抢眼(命中区 4px 跨接缝,hover 显中性灰)。
        className="absolute -left-[2px] top-0 z-30 h-full w-[4px] cursor-col-resize hover:bg-overlay/40"
      />
    </div>
  );
}

/** 常用栏宽约束(最小值 / 默认值),供 App 与工具栏表头共用。 */
export const COL = {
  nav: { min: 176, default: 224 },
  list: { min: 208, default: 320 },
  right: { min: 248, default: 300 },
} as const;
