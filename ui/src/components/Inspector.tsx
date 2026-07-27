/**
 * Inspector —— 右栏:当前笔记的属性/标签/反链。
 *
 * 功能参考 Obsidian 的"属性"与"反向链接"面板:
 * - 顶部:type 徽标 + status 彩色 chip(F-STATUS)+ tags。
 * - 反链 tab:指向当前笔记的所有入边(wiki + relation),点击跳转来源。
 * - 属性 tab:可视化编辑 frontmatter(F-PROPERTIES)——键值行内联编辑、删除、新增。
 *   编辑经 frontmatter.ts 的纯函数生成新正文,交给 autosave;语义仍以 core 为准。
 */
import { useState } from "react";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  BookOpen,
  Tag,
  Trash,
  Plus,
  Check,
  X,
} from "@phosphor-icons/react";
import * as Tabs from "@radix-ui/react-tabs";
import type { Backlink, VaultActions } from "../lib/store";
import type { NodeOut } from "../lib/ipc";
import {
  parseFrontmatterEntries,
  removeFrontmatterKey,
  setFrontmatterValue,
  type FmValue,
} from "../lib/frontmatter";
import { cn } from "../lib/cn";

interface Props {
  node: NodeOut | null;
  /** 当前笔记原文(属性编辑以此为准)。 */
  content: string;
  backlinks: Backlink[];
  actions: VaultActions;
}

/** status → 彩色 chip 的启发式映射(按词根模糊匹配常见状态)。颜色后续可配(P2)。 */
function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (/(active|open|in-progress|doing|draft|todo|backlog)/.test(s)) return "bg-green/15 text-green";
  if (/(done|complete|closed|shipped|resolved|finished)/.test(s)) return "bg-blue/15 text-blue";
  if (/(contest|disput|conflict|block|reject|fail)/.test(s)) return "bg-red/15 text-red";
  if (/(supersede|stale|deprecated|archiv|abandon|cancel|obsolete)/.test(s))
    return "bg-overlay/15 text-overlay";
  if (/(wait|pause|hold|review|pend)/.test(s)) return "bg-yellow/15 text-yellow";
  return "bg-surface text-subtext";
}

export function Inspector({ node, content, backlinks, actions }: Props) {
  const [tab, setTab] = useState("backlinks");

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center bg-mantle px-3 text-center text-[12px] text-overlay">
        无选中笔记
      </div>
    );
  }

  // entries 每次 render 由 content 派生;编辑后 content 变 → 自动刷新。
  const entries = parseFrontmatterEntries(content);
  const statusRaw = entries.find(([k]) => k === "status")?.[1];
  const statusStr = typeof statusRaw === "string" ? statusRaw : "";

  return (
    <div className="flex h-full flex-col bg-mantle">
      <div className="border-b border-crust px-3 py-2">
        <div className="truncate text-[13px] font-medium text-text">{node.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-overlay">
          {node.type && (
            <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-lavender">
              <BookOpen size={11} />
              {node.type}
            </span>
          )}
          {statusStr && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-medium",
                statusChipClass(statusStr),
              )}
            >
              {statusStr}
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
            属性 {entries.length}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="backlinks" className="min-h-0 flex-1 overflow-y-auto p-2">
          {backlinks.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">没有指向此笔记的链接。</p>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((b, i) => (
                <li key={`${b.from.id}-${i}`}>
                  <button
                    onClick={() => actions.selectNote(b.from.path)}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-surface"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-text">{b.from.title}</span>
                      {b.edge.kind === "relation" && b.edge.relation && (
                        <span className="rounded bg-surface px-1 text-[10px] text-mauve">
                          {b.edge.relation}
                        </span>
                      )}
                      {b.edge.kind === "wiki" && (
                        <span className="rounded bg-surface px-1 text-[10px] text-blue">wiki</span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-overlay">{b.from.path}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tabs.Content>

        <Tabs.Content value="props" className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* 切笔记时整体 remount,清掉各行的本地草稿态。 */}
          <PropsEditor key={node.path} content={content} entries={entries} actions={actions} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function PropsEditor({
  content,
  entries,
  actions,
}: {
  content: string;
  entries: Array<[string, FmValue]>;
  actions: VaultActions;
}) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [adding, setAdding] = useState(false);

  const commit = (key: string, value: FmValue) => {
    actions.setContent(setFrontmatterValue(content, key, value));
  };

  const remove = (key: string) => {
    actions.setContent(removeFrontmatterKey(content, key));
  };

  const confirmAdd = () => {
    const k = newKey.trim();
    if (!k) return;
    commit(k, newVal.trim());
    setNewKey("");
    setNewVal("");
    setAdding(false);
  };

  return (
    <div className="space-y-1">
      {entries.length === 0 && !adding && (
        <p className="px-1 py-2 text-[12px] text-overlay">此笔记无 frontmatter。</p>
      )}
      {entries.map(([key, value]) => (
        <PropertyRow key={key} keyName={key} value={value} onCommit={commit} onRemove={remove} />
      ))}

      {adding ? (
        <div className="flex items-center gap-1 rounded bg-surface px-2 py-1">
          <input
            autoFocus
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="键名"
            className="w-20 shrink-0 bg-transparent text-[12px] text-text outline-none"
          />
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="值"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none"
          />
          <button onClick={confirmAdd} className="text-green hover:text-text">
            <Check size={14} />
          </button>
          <button onClick={() => setAdding(false)} className="text-overlay hover:text-text">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[12px] text-overlay hover:bg-surface hover:text-subtext"
        >
          <Plus size={13} />
          新增属性
        </button>
      )}
    </div>
  );
}

function PropertyRow({
  keyName,
  value,
  onCommit,
  onRemove,
}: {
  keyName: string;
  value: FmValue;
  onCommit: (key: string, value: FmValue) => void;
  onRemove: (key: string) => void;
}) {
  // 列表值渲染为逗号串;提交时拆回数组。草稿 onBlur 提交,避免逐键 round-trip 跳光标。
  const isList = Array.isArray(value);
  const initial = isList ? (value as string[]).join(", ") : (value as string);
  const [draft, setDraft] = useState(initial);

  const commit = () => {
    const next: FmValue = isList
      ? draft.split(",").map((s) => s.trim()).filter(Boolean)
      : draft;
    // 仅在变化时写,减少无谓 autosave。
    if (next !== value && !(isList && (next as string[]).join(", ") === initial)) {
      onCommit(keyName, next);
    }
  };

  return (
    <div className="group flex items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-surface">
      <dt className="w-20 shrink-0 truncate text-overlay" title={keyName}>
        {keyName}
      </dt>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={isList ? "逗号分隔" : "空"}
        className="min-w-0 flex-1 rounded bg-crust px-1.5 py-0.5 text-text outline-none focus:ring-1 focus:ring-surface2"
      />
      <button
        onClick={() => onRemove(keyName)}
        className="shrink-0 text-overlay opacity-0 hover:text-red group-hover:opacity-100"
        title="删除该属性"
      >
        <Trash size={13} />
      </button>
    </div>
  );
}
