/**
 * TabBar —— 编辑器上方的多标签栏(F-TABS)。
 *
 * 标签语义(开/关/激活/邻居选择/重排)的纯逻辑在 tabs.ts(已测);本组件纯展示:
 * 点击激活、× 关闭、中键关闭、**拖拽重排**(HTML5 DnD → reorderTab)。标题取自
 * 快照节点,缺省回退到文件名。
 */
import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";

interface Props {
  openPaths: string[];
  activePath: string | null;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
  t: TFunc;
}

export function TabBar({ openPaths, activePath, snapshot, actions, t }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  // 激活标签的 DOM 引用:激活/打开新标签时把它滚进可视区(溢出场景)。
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activePath, openPaths.length]);

  if (openPaths.length === 0) return null;
  const titleByPath = new Map((snapshot?.nodes ?? []).map((n) => [n.path, n.title]));

  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-crust bg-mantle">
      {openPaths.map((path, idx) => {
        const active = path === activePath;
        const title = titleByPath.get(path) ?? path.split("/").pop() ?? path;
        const dragging = dragFrom === idx;
        return (
          <div
            key={path}
            ref={active ? activeRef : undefined}
            role="tab"
            tabIndex={0}
            draggable
            onDragStart={(e) => {
              setDragFrom(idx);
              e.dataTransfer.effectAllowed = "move";
              // Firefox 需要 setData 才会真正进入拖拽态。
              e.dataTransfer.setData("text/plain", path);
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropOn(idx);
            }}
            onDragLeave={() => {
              if (dropOn === idx) setDropOn(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== idx) {
                actions.reorderTab(dragFrom, idx);
              }
              setDragFrom(null);
              setDropOn(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropOn(null);
            }}
            onClick={() => actions.selectNote(path)}
            onMouseDown={(e) => {
              // 中键关闭(浏览器/编辑器通用心智)。
              if (e.button === 1) {
                e.preventDefault();
                actions.closeTab(path);
              }
            }}
            className={cn(
              "group flex min-w-[8rem] max-w-[14rem] cursor-pointer items-center gap-1.5 border-r border-crust px-2.5 py-1.5 text-[12px]",
              active
                ? "bg-base text-text"
                : "bg-mantle text-overlay hover:bg-surface hover:text-subtext",
              dragging && "opacity-40",
              dropOn === idx && !dragging && "ring-1 ring-inset ring-blue/60",
            )}
          >
            <span className="truncate" title={path}>
              {title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.closeTab(path);
              }}
              className={cn(
                "shrink-0 rounded p-0.5 hover:bg-surface2",
                active ? "text-subtext" : "text-overlay opacity-0 group-hover:opacity-100",
              )}
              title={t("common.close")}
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
