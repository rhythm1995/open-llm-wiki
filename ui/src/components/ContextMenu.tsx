/**
 * ContextMenu —— 极简右键菜单(无第三方依赖)。
 *
 * 定位到视口坐标 {x, y},测量后自动避开溢出;点击菜单项 / 点击外部 / Esc /
 * 滚动 / 窗口失焦 即关闭。给图谱右键节点用(打开 / 聚焦邻域 / 复制 wikilink /
 * 隐藏此类型)。刻意自实现而非引入 @radix-ui/react-context-menu,与图谱"纯 SVG
 * 自实现、不拉 d3"的取向一致,且本菜单结构简单(线性项 + 分隔符)。
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

export interface MenuItem {
  /** 菜单项文案;separator=true 时可省略。 */
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** true 时渲染为分隔符(其余字段忽略)。 */
  separator?: boolean;
}

interface Props {
  items: MenuItem[];
  /** 视口坐标;null 表示关闭。 */
  pos: { x: number; y: number } | null;
  onClose: () => void;
}

export function ContextMenu({ items, pos, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // 关闭时机:Esc / 滚动(捕获)/ 窗口失焦。
  useEffect(() => {
    if (!pos) return;
    // 滚动事件是异步派发的:点击前为露出目标行而发生的滚动(Playwright 的
    // scroll-into-view、用户滚轮惯性),其事件可能在菜单打开之后才送达,曾把
    // 菜单一开就关掉。用 timeStamp 甄别:只响应「打开之后真正发生的滚动」,
    // 早于打开时刻的陈旧事件忽略(timeStamp 与 performance.now() 同一时间轴)。
    const openTs = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (e: Event) => {
      if (e.timeStamp < openTs) return;
      onClose();
    };
    const onBlur = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [pos, onClose]);

  // 定位:测量后避开视口溢出(否则右下角菜单会被裁切)。
  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const el = ref.current;
    const { width, height } = el.getBoundingClientRect();
    const pad = 4;
    let { x, y } = pos;
    if (x + width > window.innerWidth) x = Math.max(pad, window.innerWidth - width - pad);
    if (y + height > window.innerHeight) y = Math.max(pad, window.innerHeight - height - pad);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [pos]);

  if (!pos) return null;

  return (
    <>
      {/* 全屏透明捕获层:点击外部 / 再次右键 → 关闭。z-40 在菜单之下。 */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        role="menu"
        className="fixed left-0 top-0 z-50 min-w-[10rem] rounded border border-crust bg-mantle py-1 text-[12px] text-subtext shadow-xl"
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((it, i) =>
          it.separator ? (
            <div key={i} className="my-1 border-t border-crust" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onClick?.();
              }}
              className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {it.icon}
              <span className="truncate">{it.label}</span>
            </button>
          ),
        )}
      </div>
    </>
  );
}
