/**
 * Inspector —— 右栏:当前笔记的属性/标签/反链。
 *
 * 功能参考 Obsidian 的"属性"与"反向链接"面板:展示 frontmatter 软类型与标签,
 * 列出指向当前笔记的所有入边(wiki + relation),点击即跳转来源。
 */
import { useState } from "react";
import { ArrowsClockwise, ArrowsLeftRight, BookOpen, Tag } from "@phosphor-icons/react";
import * as Tabs from "@radix-ui/react-tabs";
import type { Backlink, VaultActions } from "../lib/store";
import type { NodeOut } from "../lib/ipc";
import { cn } from "../lib/cn";

interface Props {
  node: NodeOut | null;
  /** 当前笔记的 frontmatter(从原文解析,展示用)。 */
  frontmatter: Record<string, unknown> | null;
  backlinks: Backlink[];
  actions: VaultActions;
}

export function Inspector({ node, frontmatter, backlinks, actions }: Props) {
  const [tab, setTab] = useState("backlinks");

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center bg-mantle px-3 text-center text-[12px] text-overlay">
        无选中笔记
      </div>
    );
  }

  const fmEntries = frontmatter ? Object.entries(frontmatter) : [];

  return (
    <div className="flex h-full flex-col bg-mantle">
      <div className="border-b border-crust px-3 py-2">
        <div className="truncate text-[13px] font-medium text-text">
          {node.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-overlay">
          {node.type && (
            <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-lavender">
              <BookOpen size={11} />
              {node.type}
            </span>
          )}
          {node.tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-teal"
            >
              <Tag size={10} />
              {t}
            </span>
          ))}
        </div>
      </div>

      <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex border-b border-crust text-[12px]">
          <Tabs.Trigger
            value="backlinks"
            className={cn(
              "flex items-center gap-1 px-3 py-1.5",
              tab === "backlinks"
                ? "border-b-2 border-blue text-text"
                : "text-overlay hover:text-subtext",
            )}
          >
            <ArrowsLeftRight size={13} />
            反链 {backlinks.length}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="props"
            className={cn(
              "flex items-center gap-1 px-3 py-1.5",
              tab === "props"
                ? "border-b-2 border-blue text-text"
                : "text-overlay hover:text-subtext",
            )}
          >
            <ArrowsClockwise size={13} />
            属性 {fmEntries.length}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content
          value="backlinks"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {backlinks.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">
              没有指向此笔记的链接。
            </p>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((b, i) => (
                <li key={`${b.from.id}-${i}`}>
                  <button
                    onClick={() => actions.selectNote(b.from.path)}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-surface"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-text">
                        {b.from.title}
                      </span>
                      {b.edge.kind === "relation" && b.edge.relation && (
                        <span className="rounded bg-surface px-1 text-[10px] text-mauve">
                          {b.edge.relation}
                        </span>
                      )}
                      {b.edge.kind === "wiki" && (
                        <span className="rounded bg-surface px-1 text-[10px] text-blue">
                          wiki
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-overlay">
                      {b.from.path}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tabs.Content>

        <Tabs.Content
          value="props"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {fmEntries.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">
              此笔记无 frontmatter。
            </p>
          ) : (
            <dl className="space-y-1">
              {fmEntries.map(([k, v]) => (
                <div
                  key={k}
                  className="flex gap-2 rounded px-2 py-1 text-[12px] hover:bg-surface"
                >
                  <dt className="shrink-0 text-overlay">{k}</dt>
                  <dd className="min-w-0 flex-1 break-words text-text">
                    {formatValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (v == null) return "—";
  return String(v);
}
