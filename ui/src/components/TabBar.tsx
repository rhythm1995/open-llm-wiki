/**
 * TabBar —— 编辑器上方的多标签栏(F-TABS)。
 *
 * 标签语义(开/关/激活/邻居选择)的纯逻辑在 tabs.ts(已测);本组件纯展示:
 * 点击激活、× 关闭、中键关闭。标题取自快照节点,缺省回退到文件名。
 */
import { X } from "@phosphor-icons/react";
import type { VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { cn } from "../lib/cn";

interface Props {
  openPaths: string[];
  activePath: string | null;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
}

export function TabBar({ openPaths, activePath, snapshot, actions }: Props) {
  if (openPaths.length === 0) return null;
  const titleByPath = new Map((snapshot?.nodes ?? []).map((n) => [n.path, n.title]));

  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-crust bg-mantle">
      {openPaths.map((path) => {
        const active = path === activePath;
        const title = titleByPath.get(path) ?? path.split("/").pop() ?? path;
        return (
          <div
            key={path}
            role="tab"
            tabIndex={0}
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
              title="关闭"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
