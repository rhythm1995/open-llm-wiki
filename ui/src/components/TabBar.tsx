/**
 * TabBar —— 编辑器上方的多标签栏(F-TABS)。
 *
 * 标签语义(开/关/激活/邻居选择/重排)的纯逻辑在 tabs.ts(已测);本组件纯展示:
 * 点击激活、× 关闭、中键关闭、**拖拽重排**(HTML5 DnD → reorderTab)。标题取自
 * 快照节点,缺省回退到文件名。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, X } from "@phosphor-icons/react";
import type { VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";

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
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  // 激活标签的 DOM 引用:激活/打开新标签时把它滚进可视区(溢出场景)。
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activePath, openPaths.length]);

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menuPath) return [];
    return [
      {
        label: t("tab.menu.close"),
        icon: <X size={13} />,
        onClick: () => actions.closeTab(menuPath),
      },
      {
        label: t("tab.menu.closeOthers"),
        onClick: () => {
          for (const p of openPaths) {
            if (p !== menuPath) actions.closeTab(p);
          }
        },
        disabled: openPaths.length <= 1,
      },
      { separator: true },
      {
        label: t("tab.menu.copyPath"),
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard?.writeText(menuPath);
        },
      },
    ];
  }, [menuPath, openPaths, actions, t]);

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
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuPath(path);
              setMenuPos({ x: e.clientX, y: e.clientY });
            }}
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
              "group relative flex min-w-[8rem] max-w-[14rem] cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[12px]",
              active
                ? "bg-base text-text"
                : "bg-transparent text-overlay hover:bg-surface hover:text-subtext",
              dragging && "opacity-40",
              dropOn === idx && !dragging && "ring-1 ring-inset ring-blue/60",
            )}
          >
            {/* 激活:顶部紫色细条(Obsidian 式 active indicator;绝对定位无布局位移)。 */}
            {active && (
              <span className="absolute inset-x-0 top-0 h-0.5 bg-blue" />
            )}
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
      <ContextMenu
        items={menuItems}
        pos={menuPos}
        onClose={() => {
          setMenuPos(null);
          setMenuPath(null);
        }}
      />
    </div>
  );
}
