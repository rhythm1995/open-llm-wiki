/**
 * Inspector —— 右栏知识卡片:当前笔记的类型/定义/属性/反链。
 *
 * 功能参考公开的「属性 + 反向链接」面板形态(原创实现):
 * - 顶部 Header Card:标题 + type/status/tags + definition 摘要 + 可折叠类型说明。
 * - 反链 tab:按来源笔记合并 wiki/relation 入边,点击跳转。
 * - 属性 tab:可视化编辑 frontmatter(F-PROPERTIES)——基础 / 关系 / 其他三段:
 *     · type        → 下拉(vault 内出现过的类型)
 *     · definition  → 多行 textarea
 *     · 关系字段    → wikilink chip(显示解析标题)+ 标题补全
 *     · tags        → 自由文本 chip 增删
 *     · 其余        → 标量 / 逗号列表文本 input(长文本走 textarea)
 *   编辑经 frontmatter.ts 的纯函数生成新正文,交给 autosave;语义仍以 core 为准。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  BookOpen,
  CaretRight,
  Image as ImageIcon,
  List,
  Tag,
  Trash,
  Plus,
  Check,
  Clipboard,
  X,
  FileText,
  Warning,
} from "@phosphor-icons/react";
import * as Tabs from "@radix-ui/react-tabs";
import type { Backlink, VaultActions } from "../lib/store";
import { groupBacklinks } from "../lib/backlinks";
import type { MediaMetaOut, NodeOut } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import type { TFunc } from "../lib/i18n";
import { isIMEComposing } from "../lib/ime";
import { findBrokenWikilinks } from "../lib/broken-links";
import { splitFrontmatter } from "../lib/frontmatter";
import {
  parseFrontmatterEntries,
  removeFrontmatterKey,
  setFrontmatterValue,
  isRelationValue,
  relationTargets,
  asWikilink,
  type FmValue,
} from "../lib/frontmatter";
import { filterByTitles, resolveTitleForTarget, resolveWikiTarget } from "../lib/wikilink";
import { nestOutline, parseOutline, type OutlineNode } from "../lib/outline";
import { statusChipClass } from "../lib/status-chip";
import { labelStatus, labelType } from "../lib/wiki-labels";
import { resolveTypeDoc } from "../lib/type-doc";
import { cn } from "../lib/cn";

const BASIC_KEYS = new Set(["type", "status", "definition"]);

function OutlineTree({
  nodes,
  collapsed,
  onToggle,
  onJump,
  t,
}: {
  nodes: OutlineNode[];
  collapsed: Set<number>;
  onToggle: (index: number) => void;
  onJump: (target: { bodyLine: number; index: number }) => void;
  t: TFunc;
}) {
  return (
    <ul className="space-y-0">
      {nodes.map((n) => {
        const hasKids = n.children.length > 0;
        const folded = collapsed.has(n.index);
        return (
          <li key={n.index}>
            <div className="flex min-w-0 items-center gap-0.5">
              {hasKids ? (
                <button
                  type="button"
                  data-testid="outline-collapse"
                  data-outline-index={n.index}
                  aria-expanded={!folded}
                  title={
                    folded
                      ? t("inspector.outline.expand")
                      : t("inspector.outline.collapse")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(n.index);
                  }}
                  className="flex h-5 w-4 shrink-0 items-center justify-center rounded text-overlay hover:bg-surface hover:text-text"
                >
                  <CaretRight
                    size={10}
                    weight="bold"
                    className={cn("transition-transform", !folded && "rotate-90")}
                  />
                </button>
              ) : (
                <span className="inline-block h-5 w-4 shrink-0" />
              )}
              <button
                type="button"
                data-testid="outline-heading"
                data-outline-index={n.index}
                onClick={() =>
                  onJump({ bodyLine: n.heading.line, index: n.index })
                }
                className={cn(
                  "min-w-0 flex-1 truncate rounded py-0.5 text-left text-[12px] hover:bg-surface hover:text-text",
                  n.heading.level === 1
                    ? "font-medium text-text"
                    : "text-subtext",
                )}
                title={n.heading.text}
              >
                {n.heading.text}
              </button>
            </div>
            {hasKids && !folded && (
              <div className="ml-2 border-l border-crust pl-1.5">
                <OutlineTree
                  nodes={n.children}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onJump={onJump}
                  t={t}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  node: NodeOut | null;
  /** 当前笔记原文(属性编辑以此为准)。 */
  content: string;
  backlinks: Backlink[];
  actions: VaultActions;
  /** 大纲点击跳转:body 行号给源码模式,index 给所见即所得标题块。 */
  onJumpToHeading: (target: { bodyLine: number; index: number }) => void;
  /** vault 内全部笔记标题(关系字段 chip 补全候选)。 */
  noteTitles: string[];
  /** vault 内出现过的 type 值去重(type 下拉选项)。 */
  typeOptions: string[];
  /** 全库节点(解析类型文档 / chip 标题)。 */
  vaultNodes?: NodeOut[];
  /** vault 根;媒体索引查询用。 */
  root?: string | null;
  t: TFunc;
}

export function Inspector({
  node,
  content,
  backlinks,
  actions,
  onJumpToHeading,
  noteTitles,
  typeOptions,
  vaultNodes = [],
  root = null,
  t,
}: Props) {
  const [tab, setTab] = useState("backlinks");
  const [copied, setCopied] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaMetaOut[]>([]);
  const [typeDocOpen, setTypeDocOpen] = useState(false);
  const [defExpanded, setDefExpanded] = useState(false);
  /** 大纲折叠:存节点 index;切笔记清空。 */
  const [outlineCollapsed, setOutlineCollapsed] = useState<Set<number>>(
    () => new Set(),
  );

  // 本笔记媒体:content 变 → 重查(桌面 live 索引;mock 扫正文)。
  useEffect(() => {
    if (!node || !root) {
      setMediaItems([]);
      return;
    }
    let cancelled = false;
    void ipc.mediaOfNote(root, node.path).then((list) => {
      if (!cancelled) setMediaItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, [node?.path, content, root]);

  useEffect(() => {
    setTypeDocOpen(false);
    setDefExpanded(false);
    setOutlineCollapsed(new Set());
  }, [node?.path]);

  // hooks 须在 early return 前。
  const typeDoc = useMemo(() => {
    if (!node?.type) return null;
    return resolveTypeDoc(
      node.type,
      vaultNodes.map((n) => ({
        id: n.id,
        path: n.path,
        title: n.title,
        type: n.type,
        preview: n.preview,
      })),
    );
  }, [node?.type, vaultNodes]);

  const bodyOnly = useMemo(
    () => splitFrontmatter(content).body,
    [content],
  );
  const brokenLinks = useMemo(
    () => findBrokenWikilinks(bodyOnly, vaultNodes),
    [bodyOnly, vaultNodes],
  );
  const grouped = useMemo(() => groupBacklinks(backlinks), [backlinks]);
  const outline = useMemo(() => parseOutline(bodyOnly), [bodyOnly]);
  const outlineTree = useMemo(() => nestOutline(outline), [outline]);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center bg-mantle px-3 text-center text-[12px] text-overlay">
        {t("inspector.noSelection")}
      </div>
    );
  }

  // entries / outline 每次 render 由 content 派生;编辑后 content 变 → 自动刷新。
  const entries = parseFrontmatterEntries(content);
  const statusRaw = entries.find(([k]) => k === "status")?.[1];
  const statusStr = typeof statusRaw === "string" ? statusRaw : "";
  const definitionRaw = entries.find(([k]) => k === "definition")?.[1];
  const definition = typeof definitionRaw === "string" ? definitionRaw.trim() : "";
  const showDefExpand = definition.includes("\n") || definition.length > 40;

  return (
    <div className="flex h-full flex-col bg-mantle" data-testid="inspector">
      <div className="border-b border-crust px-3 py-2">
        <div className="rounded border border-crust/80 bg-surface/40 px-2.5 py-2">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
              {node.title}
            </span>
            <button
              onClick={async () => {
                await actions.copyAiContext();
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="shrink-0 rounded p-1 text-overlay hover:bg-surface hover:text-text"
              title={t("inspector.ai.copy")}
            >
              {copied ? (
                <Check size={13} className="text-green" />
              ) : (
                <Clipboard size={13} />
              )}
            </button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-overlay">
            {node.type && (
              typeDoc ? (
                <button
                  type="button"
                  onClick={() => setTypeDocOpen((o) => !o)}
                  className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-lavender hover:bg-surface2"
                  title={t("inspector.typeDoc.title")}
                >
                  <BookOpen size={11} />
                  {labelType(node.type, t)}
                </button>
              ) : (
                <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-lavender">
                  <BookOpen size={11} />
                  {labelType(node.type, t)}
                </span>
              )
            )}
            {statusStr && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-medium",
                  statusChipClass(statusStr),
                )}
              >
                {labelStatus(statusStr, t)}
              </span>
            )}
            {node.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-teal"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
          {definition && (
            <div
              className="mt-1.5 text-[11px] text-subtext"
              data-testid="inspector-definition"
            >
              <div className="flex items-start gap-1">
                <span className="shrink-0 text-overlay">
                  {t("inspector.header.definition")}:
                </span>
                <p
                  className={cn(
                    "min-w-0 flex-1",
                    defExpanded ? "whitespace-pre-wrap" : "line-clamp-2",
                  )}
                >
                  {definition}
                </p>
                {showDefExpand && (
                  <button
                    type="button"
                    onClick={() => setDefExpanded((o) => !o)}
                    className="shrink-0 text-blue hover:underline"
                  >
                    {defExpanded
                      ? t("inspector.header.definitionCollapse")
                      : t("inspector.header.definitionExpand")}
                  </button>
                )}
              </div>
            </div>
          )}
          {typeDoc && (
            <div className="mt-1.5" data-testid="inspector-type-doc">
              <button
                type="button"
                onClick={() => setTypeDocOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] text-overlay hover:text-subtext"
              >
                <FileText size={11} />
                <span>{t("inspector.typeDoc.title")}</span>
                <CaretRight
                  size={11}
                  className={cn("transition-transform", typeDocOpen && "rotate-90")}
                />
              </button>
              {typeDocOpen && (
                <button
                  type="button"
                  className="mt-1 w-full rounded px-1 text-left text-[11px] text-blue hover:underline"
                  onClick={() => actions.selectNote(typeDoc.path)}
                  title={typeDoc.path}
                >
                  <span className="font-medium">{typeDoc.title}</span>
                  {typeDoc.hint && (
                    <span className="mt-0.5 line-clamp-2 block text-subtext">
                      {typeDoc.hint}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        {brokenLinks.length > 0 && (
          <div
            className="mt-1.5 rounded border border-yellow/40 bg-yellow/10 px-2 py-1.5 text-[11px]"
            data-testid="inspector-broken-links"
          >
            <div className="mb-0.5 flex items-center gap-1 text-yellow">
              <Warning size={11} />
              <span>
                {t("inspector.brokenLinks.title", { n: brokenLinks.length })}
              </span>
            </div>
            <ul className="max-h-20 space-y-0.5 overflow-y-auto">
              {brokenLinks.map((b) => (
                <li
                  key={b.inner}
                  className="truncate font-mono text-[10px] text-subtext"
                  title={b.inner}
                >
                  [[{b.inner}]]
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List className="flex border-b border-crust text-[12px]">
          <Tabs.Trigger value="backlinks" className={tabTriggerClass(tab === "backlinks")}>
            <ArrowsLeftRight size={13} />
            {t("inspector.tab.backlinks")} {grouped.length}
          </Tabs.Trigger>
          <Tabs.Trigger value="props" className={tabTriggerClass(tab === "props")}>
            <ArrowsClockwise size={13} />
            {t("inspector.tab.props")} {entries.length}
          </Tabs.Trigger>
          <Tabs.Trigger value="outline" className={tabTriggerClass(tab === "outline")}>
            <List size={13} />
            {t("inspector.tab.outline")} {outline.length}
          </Tabs.Trigger>
          <Tabs.Trigger value="media" className={tabTriggerClass(tab === "media")}>
            <ImageIcon size={13} />
            {t("inspector.tab.media")} {mediaItems.length}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="backlinks" className="min-h-0 flex-1 overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">{t("inspector.backlinks.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {grouped.map((g) => (
                <li key={g.from.id}>
                  <button
                    onClick={() => actions.selectNote(g.from.path)}
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-surface"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                        {g.from.title}
                      </span>
                      {g.kinds.includes("wiki") && (
                        <span
                          data-testid="backlink-kind-wiki"
                          className="rounded bg-blue/10 px-1 text-[10px] text-blue"
                        >
                          wiki
                        </span>
                      )}
                      {g.relations.map((rel) => (
                        <span
                          key={rel}
                          data-testid="backlink-kind-relation"
                          className="rounded bg-mauve/10 px-1 text-[10px] text-mauve"
                        >
                          {rel}
                        </span>
                      ))}
                    </div>
                    <div className="truncate text-[11px] text-overlay">{g.from.path}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tabs.Content>

        <Tabs.Content value="props" className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* 切笔记时整体 remount,清掉各行的本地草稿态。 */}
          <PropsEditor
            key={node.path}
            content={content}
            entries={entries}
            noteTitles={noteTitles}
            typeOptions={typeOptions}
            vaultNodes={vaultNodes}
            actions={actions}
            t={t}
          />
        </Tabs.Content>

        <Tabs.Content value="outline" className="min-h-0 flex-1 overflow-y-auto p-2">
          {outline.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">{t("inspector.outline.empty")}</p>
          ) : (
            <OutlineTree
              nodes={outlineTree}
              collapsed={outlineCollapsed}
              onToggle={(index) => {
                setOutlineCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                });
              }}
              onJump={onJumpToHeading}
              t={t}
            />
          )}
        </Tabs.Content>

        <Tabs.Content value="media" className="min-h-0 flex-1 overflow-y-auto p-2">
          {!root ? (
            <p className="px-1 py-2 text-[12px] text-overlay">
              {t("inspector.media.noVault")}
            </p>
          ) : mediaItems.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">
              {t("inspector.media.empty")}
            </p>
          ) : (
            <ul className="space-y-1">
              {mediaItems.map((m) => {
                // 桌面 missing 占位 bytes=0;mock 亦常为 0(无 fs size)——仅作弱提示。
                const broken = m.bytes === 0;
                return (
                  <li
                    key={m.path}
                    className="rounded border border-crust/80 bg-surface/30 px-2 py-1.5"
                  >
                    <div className="flex items-start gap-1.5">
                      {broken ? (
                        <Warning
                          size={14}
                          className="mt-0.5 shrink-0 text-yellow"
                        />
                      ) : (
                        <ImageIcon
                          size={14}
                          className="mt-0.5 shrink-0 text-teal"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate font-mono text-[11px] text-text"
                          title={m.path}
                        >
                          {m.path}
                        </div>
                        <div className="mt-0.5 text-[10px] text-overlay">
                          {broken
                            ? t("inspector.media.missing")
                            : t("inspector.media.meta", {
                                bytes: formatBytes(m.bytes),
                                n: m.refcount,
                              })}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function tabTriggerClass(active: boolean): string {
  return cn(
    "flex items-center gap-1 px-3 py-1.5",
    active
      ? "border-b-[2.5px] border-blue bg-surface2 font-medium text-text"
      : "text-overlay hover:bg-surface/50 hover:text-subtext",
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function partitionEntries(entries: Array<[string, FmValue]>): {
  basic: Array<[string, FmValue]>;
  relations: Array<[string, FmValue]>;
  other: Array<[string, FmValue]>;
} {
  const basic: Array<[string, FmValue]> = [];
  const relations: Array<[string, FmValue]> = [];
  const other: Array<[string, FmValue]> = [];
  for (const e of entries) {
    if (BASIC_KEYS.has(e[0])) basic.push(e);
    else if (isRelationValue(e[1])) relations.push(e);
    else other.push(e);
  }
  return { basic, relations, other };
}

function PropsEditor({
  content,
  entries,
  noteTitles,
  typeOptions,
  vaultNodes,
  actions,
  t,
}: {
  content: string;
  entries: Array<[string, FmValue]>;
  noteTitles: string[];
  typeOptions: string[];
  vaultNodes: NodeOut[];
  actions: VaultActions;
  t: TFunc;
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

  const { basic, relations, other } = partitionEntries(entries);

  const rowProps = { noteTitles, typeOptions, vaultNodes, onCommit: commit, onRemove: remove, t };

  return (
    <div className="space-y-2">
      {entries.length === 0 && !adding && (
        <p className="px-1 py-2 text-[12px] text-overlay">{t("inspector.props.empty")}</p>
      )}
      <PropGroup label={t("inspector.props.group.basic")} entries={basic} rowProps={rowProps} />
      {basic.length > 0 && (relations.length > 0 || other.length > 0) && (
        <div className="border-t border-crust/80" />
      )}
      <PropGroup
        label={t("inspector.props.group.relations")}
        entries={relations}
        rowProps={rowProps}
      />
      {relations.length > 0 && other.length > 0 && (
        <div className="border-t border-crust/80" />
      )}
      <PropGroup label={t("inspector.props.group.other")} entries={other} rowProps={rowProps} />

      {adding ? (
        <div className="flex items-center gap-1 rounded bg-surface px-2 py-1">
          <input
            autoFocus
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isIMEComposing(e)) confirmAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={t("inspector.props.keyPlaceholder")}
            className="w-20 shrink-0 bg-transparent text-[12px] text-text outline-none"
          />
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isIMEComposing(e)) confirmAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={t("inspector.props.valuePlaceholder")}
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
          {t("inspector.props.add")}
        </button>
      )}
    </div>
  );
}

function PropGroup({
  label,
  entries,
  rowProps,
}: {
  label: string;
  entries: Array<[string, FmValue]>;
  rowProps: {
    noteTitles: string[];
    typeOptions: string[];
    vaultNodes: NodeOut[];
    onCommit: (key: string, value: FmValue) => void;
    onRemove: (key: string) => void;
    t: TFunc;
  };
}) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="px-2 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-overlay">
        {label}
      </div>
      {entries.map(([key, value]) => (
        <PropertyRow
          key={key}
          keyName={key}
          value={value}
          noteTitles={rowProps.noteTitles}
          typeOptions={rowProps.typeOptions}
          vaultNodes={rowProps.vaultNodes}
          onCommit={rowProps.onCommit}
          onRemove={rowProps.onRemove}
          t={rowProps.t}
        />
      ))}
    </div>
  );
}

/**
 * 属性行分发器:按 key / value 语义选控件。
 * type→下拉;definition/长文本→textarea;关系字段→wikilink chip+补全;tags→chip;其余→文本。
 */
function PropertyRow({
  keyName,
  value,
  noteTitles,
  typeOptions,
  vaultNodes,
  onCommit,
  onRemove,
  t,
}: {
  keyName: string;
  value: FmValue;
  noteTitles: string[];
  typeOptions: string[];
  vaultNodes: NodeOut[];
  onCommit: (key: string, value: FmValue) => void;
  onRemove: (key: string) => void;
  t: TFunc;
}) {
  if (keyName === "type") {
    return (
      <TypeRow
        keyName={keyName}
        value={value}
        typeOptions={typeOptions}
        onCommit={onCommit}
        onRemove={onRemove}
        t={t}
      />
    );
  }
  if (isRelationValue(value)) {
    return (
      <RowShell keyName={keyName} onRemove={onRemove} t={t} align="start">
        <ChipRow
          values={relationTargets(value)}
          suggestions={noteTitles}
          placeholder={t("inspector.props.valuePlaceholder")}
          onChange={(next) => onCommit(keyName, next.map(asWikilink))}
          variant="relation"
          vaultNodes={vaultNodes}
        />
      </RowShell>
    );
  }
  if (keyName === "tags" && Array.isArray(value)) {
    return (
      <RowShell keyName={keyName} onRemove={onRemove} t={t}>
        <ChipRow
          values={value}
          placeholder={t("inspector.props.listPlaceholder")}
          onChange={(next) => onCommit(keyName, next)}
        />
      </RowShell>
    );
  }
  if (shouldUseTextarea(keyName, value)) {
    return (
      <TextareaRow
        keyName={keyName}
        value={value}
        onCommit={onCommit}
        onRemove={onRemove}
        t={t}
      />
    );
  }
  return (
    <TextRow keyName={keyName} value={value} onCommit={onCommit} onRemove={onRemove} t={t} />
  );
}

function shouldUseTextarea(keyName: string, value: FmValue): value is string {
  if (typeof value !== "string") return false;
  if (keyName === "definition") return true;
  return value.includes("\n") || value.length > 60;
}

/** 属性行外壳:键名 + 子控件 + 悬停删除。 */
function RowShell({
  keyName,
  onRemove,
  t,
  children,
  align = "center",
}: {
  keyName: string;
  onRemove: (key: string) => void;
  t: TFunc;
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "group flex gap-2 rounded px-2 py-1 text-[12px] hover:bg-surface",
        align === "start" ? "items-start" : "items-center",
      )}
    >
      <dt
        className={cn(
          "w-20 shrink-0 truncate text-[11px] tracking-wide text-overlay",
          align === "start" && "pt-0.5",
        )}
        title={keyName}
      >
        {keyName}
      </dt>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        onClick={() => onRemove(keyName)}
        className={cn(
          "shrink-0 text-overlay opacity-0 hover:text-red group-hover:opacity-100",
          align === "start" && "mt-0.5",
        )}
        title={t("inspector.props.delete")}
      >
        <Trash size={13} />
      </button>
    </div>
  );
}

/** type:下拉(vault 内出现过的类型;当前值不在其中时补一个 option 防丢失)。 */
function TypeRow({
  keyName,
  value,
  typeOptions,
  onCommit,
  onRemove,
  t,
}: {
  keyName: string;
  value: FmValue;
  typeOptions: string[];
  onCommit: (key: string, value: FmValue) => void;
  onRemove: (key: string) => void;
  t: TFunc;
}) {
  const current = typeof value === "string" ? value : "";
  const opts =
    current && !typeOptions.includes(current) ? [current, ...typeOptions] : typeOptions;
  return (
    <RowShell keyName={keyName} onRemove={onRemove} t={t}>
      <select
        value={current}
        onChange={(e) => onCommit(keyName, e.target.value)}
        className="w-full rounded bg-crust px-1.5 py-0.5 text-text outline-none focus:ring-1 focus:ring-surface2"
      >
        <option value="">{t("inspector.props.emptyValue")}</option>
        {opts.map((tp) => (
          <option key={tp} value={tp}>
            {labelType(tp, t)}
          </option>
        ))}
      </select>
    </RowShell>
  );
}

/** 默认行:标量或逗号列表的文本 input。草稿 onBlur 提交,避免逐键 round-trip 跳光标。 */
function TextRow({
  keyName,
  value,
  onCommit,
  onRemove,
  t,
}: {
  keyName: string;
  value: FmValue;
  onCommit: (key: string, value: FmValue) => void;
  onRemove: (key: string) => void;
  t: TFunc;
}) {
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
    <RowShell keyName={keyName} onRemove={onRemove} t={t}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={
          isList ? t("inspector.props.listPlaceholder") : t("inspector.props.emptyValue")
        }
        className="w-full rounded bg-crust px-1.5 py-0.5 text-text outline-none focus:ring-1 focus:ring-surface2"
      />
    </RowShell>
  );
}

/** 多行文本(definition / 长标量)。Enter 换行;blur 提交。 */
function TextareaRow({
  keyName,
  value,
  onCommit,
  onRemove,
  t,
}: {
  keyName: string;
  value: string;
  onCommit: (key: string, value: FmValue) => void;
  onRemove: (key: string) => void;
  t: TFunc;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    grow();
  }, [draft]);

  const commit = () => {
    if (draft !== value) onCommit(keyName, draft);
  };

  return (
    <RowShell keyName={keyName} onRemove={onRemove} t={t} align="start">
      <textarea
        ref={ref}
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={t("inspector.props.valuePlaceholder")}
        className="w-full resize-none rounded bg-crust px-1.5 py-0.5 text-text outline-none focus:ring-1 focus:ring-surface2"
      />
    </RowShell>
  );
}

/**
 * chip 多选(tags 与关系字段共用)。回车/点候选新增;chip 上的 × 或 Backspace 删除末项。
 * suggestions 传入时,聚焦输入会弹按标题过滤的补全列表(关系字段用);tags 不传,自由输入。
 * variant=relation:淡紫底、显示解析标题、换行而非截断。
 */
function ChipRow({
  values,
  suggestions,
  placeholder,
  onChange,
  variant = "default",
  vaultNodes,
}: {
  values: string[];
  suggestions?: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
  variant?: "default" | "relation";
  vaultNodes?: NodeOut[];
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const matches =
    suggestions && draft.trim()
      ? filterByTitles(suggestions, draft)
          .filter((s) => !values.includes(s))
          .slice(0, 8)
      : [];

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  };

  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center gap-1 rounded px-1.5 py-0.5",
        variant === "relation" ? "bg-mauve/10 ring-1 ring-mauve/20" : "bg-crust",
      )}
    >
      {values.map((v, i) => {
        const label =
          variant === "relation" && vaultNodes
            ? resolveTitleForTarget(v, vaultNodes)
            : v;
        const resolved =
          variant === "relation" && vaultNodes
            ? resolveWikiTarget(v, vaultNodes)
            : null;
        const typed = resolved
          ? vaultNodes?.find((n) => n.path === resolved)
          : undefined;
        return (
          <span
            key={`${v}-${i}`}
            className={cn(
              "inline-flex items-center gap-0.5 rounded bg-surface px-1 py-0.5 text-[11px] text-text",
              variant === "relation" ? "max-w-full" : "max-w-[120px]",
            )}
            title={v}
          >
            {variant === "relation" && typed?.type && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lavender" />
            )}
            <span className={variant === "relation" ? "break-all" : "truncate"}>
              {label}
            </span>
            <button
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-overlay hover:text-red"
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isIMEComposing(e)) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && values.length) {
            onChange(values.slice(0, -1));
          } else if (e.key === "Escape") {
            setDraft("");
          }
        }}
        placeholder={values.length === 0 ? placeholder : ""}
        className="min-w-[60px] flex-1 bg-transparent text-[12px] text-text outline-none"
      />
      {focused && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-48 overflow-auto rounded border border-crust bg-mantle shadow-lg">
          {matches.map((s) => (
            <li key={s}>
              <button
                // onMouseDown 在 input onBlur 之前触发,保住点击命中。
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                className="block w-full truncate px-2 py-1 text-left text-[12px] text-subtext hover:bg-surface hover:text-text"
                title={s}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
