/**
 * Inspector —— 右栏:当前笔记的属性/标签/反链。
 *
 * 功能参考 Obsidian 的"属性"与"反向链接"面板:
 * - 顶部:type 徽标 + status 彩色 chip(F-STATUS)+ tags。
 * - 反链 tab:指向当前笔记的所有入边(wiki + relation),点击跳转来源。
 * - 属性 tab:可视化编辑 frontmatter(F-PROPERTIES)——按字段语义分发控件:
 *     · type        → 下拉(vault 内出现过的类型)
 *     · 关系字段    → wikilink chip + 标题补全(对标 Tolaria ADR-0010:值为 [[wikilink]]
 *                    的字段即关系;core 的 relationship_links 同此规则)
 *     · tags        → 自由文本 chip 增删
 *     · 其余        → 标量 / 逗号列表文本 input
 *   编辑经 frontmatter.ts 的纯函数生成新正文,交给 autosave;语义仍以 core 为准。
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  BookOpen,
  List,
  Tag,
  Trash,
  Plus,
  Check,
  Clipboard,
  X,
  FileText,
} from "@phosphor-icons/react";
import * as Tabs from "@radix-ui/react-tabs";
import type { Backlink, VaultActions } from "../lib/store";
import type { NodeOut } from "../lib/ipc";
import type { TFunc } from "../lib/i18n";
import {
  parseFrontmatterEntries,
  removeFrontmatterKey,
  setFrontmatterValue,
  isRelationValue,
  relationTargets,
  asWikilink,
  type FmValue,
} from "../lib/frontmatter";
import { filterByTitles } from "../lib/wikilink";
import { parseOutline } from "../lib/outline";
import { statusChipClass } from "../lib/status-chip";
import { resolveTypeDoc } from "../lib/type-doc";
import { cn } from "../lib/cn";

interface Props {
  node: NodeOut | null;
  /** 当前笔记原文(属性编辑以此为准)。 */
  content: string;
  backlinks: Backlink[];
  actions: VaultActions;
  /** 大纲点击跳转:把编辑器滚动到某行(1-based)。 */
  onJumpToLine: (line: number) => void;
  /** vault 内全部笔记标题(关系字段 chip 补全候选)。 */
  noteTitles: string[];
  /** vault 内出现过的 type 值去重(type 下拉选项)。 */
  typeOptions: string[];
  /** 全库节点(解析类型文档)。 */
  vaultNodes?: NodeOut[];
  t: TFunc;
}

export function Inspector({
  node,
  content,
  backlinks,
  actions,
  onJumpToLine,
  noteTitles,
  typeOptions,
  vaultNodes = [],
  t,
}: Props) {
  const [tab, setTab] = useState("backlinks");
  const [copied, setCopied] = useState(false);

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
  const outline = parseOutline(stripFrontmatter(content));

  return (
    <div className="flex h-full flex-col bg-mantle">
      <div className="border-b border-crust px-3 py-2">
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
        {/* 类型文档(仅提示,不强制) */}
        {node.type && (
          <div className="mt-1.5 rounded border border-crust/80 bg-surface/40 px-2 py-1.5 text-[11px]">
            <div className="mb-0.5 flex items-center gap-1 text-overlay">
              <FileText size={11} />
              <span>{t("inspector.typeDoc.title")}</span>
            </div>
            {typeDoc ? (
              <button
                type="button"
                className="w-full text-left text-blue hover:underline"
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
            ) : (
              <p className="text-overlay">{t("inspector.typeDoc.none")}</p>
            )}
          </div>
        )}
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
            {t("inspector.tab.backlinks")} {backlinks.length}
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
            {t("inspector.tab.props")} {entries.length}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="outline"
            className={cn(
              "flex items-center gap-1 px-3 py-1.5",
              tab === "outline"
                ? "border-b-2 border-blue text-text"
                : "text-overlay hover:text-subtext",
            )}
          >
            <List size={13} />
            {t("inspector.tab.outline")} {outline.length}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="backlinks" className="min-h-0 flex-1 overflow-y-auto p-2">
          {backlinks.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">{t("inspector.backlinks.empty")}</p>
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
          <PropsEditor
            key={node.path}
            content={content}
            entries={entries}
            noteTitles={noteTitles}
            typeOptions={typeOptions}
            actions={actions}
            t={t}
          />
        </Tabs.Content>

        <Tabs.Content value="outline" className="min-h-0 flex-1 overflow-y-auto p-2">
          {outline.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-overlay">{t("inspector.outline.empty")}</p>
          ) : (
            <ul className="space-y-0.5">
              {outline.map((h, i) => (
                <li key={`${h.line}-${i}`}>
                  <button
                    onClick={() => onJumpToLine(h.line)}
                    className="block w-full truncate rounded py-1 text-left text-[12px] text-subtext hover:bg-surface hover:text-text"
                    style={{ paddingLeft: (h.level - 1) * 12 + 8 }}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

/** 去掉 frontmatter 围栏;YAML 注释(`# …`)否则会被大纲误判为标题。 */
function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

function PropsEditor({
  content,
  entries,
  noteTitles,
  typeOptions,
  actions,
  t,
}: {
  content: string;
  entries: Array<[string, FmValue]>;
  noteTitles: string[];
  typeOptions: string[];
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

  return (
    <div className="space-y-1">
      {entries.length === 0 && !adding && (
        <p className="px-1 py-2 text-[12px] text-overlay">{t("inspector.props.empty")}</p>
      )}
      {entries.map(([key, value]) => (
        <PropertyRow
          key={key}
          keyName={key}
          value={value}
          noteTitles={noteTitles}
          typeOptions={typeOptions}
          onCommit={commit}
          onRemove={remove}
          t={t}
        />
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
            placeholder={t("inspector.props.keyPlaceholder")}
            className="w-20 shrink-0 bg-transparent text-[12px] text-text outline-none"
          />
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
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

/**
 * 属性行分发器:按 key / value 语义选控件。
 * type→下拉;关系字段(值为 [[wikilink]])→wikilink chip+补全;tags→chip;其余→文本。
 */
function PropertyRow({
  keyName,
  value,
  noteTitles,
  typeOptions,
  onCommit,
  onRemove,
  t,
}: {
  keyName: string;
  value: FmValue;
  noteTitles: string[];
  typeOptions: string[];
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
      <RowShell keyName={keyName} onRemove={onRemove} t={t}>
        <ChipRow
          values={relationTargets(value)}
          suggestions={noteTitles}
          placeholder={t("inspector.props.valuePlaceholder")}
          onChange={(next) => onCommit(keyName, next.map(asWikilink))}
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
  return (
    <TextRow keyName={keyName} value={value} onCommit={onCommit} onRemove={onRemove} t={t} />
  );
}

/** 属性行外壳:键名 + 子控件 + 悬停删除。 */
function RowShell({
  keyName,
  onRemove,
  t,
  children,
}: {
  keyName: string;
  onRemove: (key: string) => void;
  t: TFunc;
  children: ReactNode;
}) {
  return (
    <div className="group flex items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-surface">
      <dt className="w-20 shrink-0 truncate text-overlay" title={keyName}>
        {keyName}
      </dt>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        onClick={() => onRemove(keyName)}
        className="shrink-0 text-overlay opacity-0 hover:text-red group-hover:opacity-100"
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
            {tp}
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

/**
 * chip 多选(tags 与关系字段共用)。回车/点候选新增;chip 上的 × 或 Backspace 删除末项。
 * suggestions 传入时,聚焦输入会弹按标题过滤的补全列表(关系字段用);tags 不传,自由输入。
 */
function ChipRow({
  values,
  suggestions,
  placeholder,
  onChange,
}: {
  values: string[];
  suggestions?: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
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
    <div className="relative flex flex-wrap items-center gap-1 rounded bg-crust px-1.5 py-0.5">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="flex items-center gap-0.5 rounded bg-surface px-1 py-0.5 text-[11px] text-text"
        >
          <span className="max-w-[120px] truncate">{v}</span>
          <button
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="text-overlay hover:text-red"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
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
