import { type ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * 统一 hover 解释泡(CSS-only、免状态):hover 时弹小泡,取代原生 title
 * (原生 title 延迟大、样式不可控)。composer / 面板表头 / 应用顶栏共用。
 *
 * - `side`:"up"(底部控件,向上弹,默认)/ "down"(顶栏按钮,向下弹)。
 * - `hide`:弹层打开时避让重叠(如下拉展开期间不叠解释泡)。
 * - `align`:泡的水平锚点,left-0 / right-0,防边缘溢出。
 * - named group(group/hp)防与外层 group 串味。
 */
export function HoverPop({
  text,
  lead,
  align = "left",
  side = "up",
  hide = false,
  className,
  children,
}: {
  /** 解释正文。 */
  text: string;
  /** 加粗引行(如当前模式名 / 用量数字)。 */
  lead?: string;
  align?: "left" | "right";
  side?: "up" | "down";
  hide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("group/hp relative", className)}>
      {children}
      {!hide && (
        <span
          className={cn(
            "pointer-events-none absolute z-40 hidden w-56 rounded-md border border-crust bg-mantle px-2 py-1.5 shadow-lg group-hover/hp:block",
            side === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          {lead && (
            <span className="mb-0.5 block text-[10px] font-semibold text-text">
              {lead}
            </span>
          )}
          <span className="block text-[10px] leading-relaxed text-overlay">
            {text}
          </span>
        </span>
      )}
    </span>
  );
}
