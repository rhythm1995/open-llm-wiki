/**
 * QueryPanel —— 差异化之二:QQL 查询面板。
 *
 * 用户输入 QQL(类 DQL 文本),调 run_qql 走 Rust core 求值,按 ResultSet 形态渲染:
 * 列表 / 表格 / 计数 / 分组 / 求和。这是 Obsidian 不具备的"原生实时查询 + 聚合"卖点。
 *
 * 客户端只做轻活:从 QQL 文本里抠出 SHOW 列(给表头),以及把行 id 映射回节点标题。
 * 求值与语法完全在 core(qql::parse + query::eval),保证 UI 与 core 语义一致。
 */
import { useMemo, useState } from "react";
import { Play, MagnifyingGlass, Warning, Bookmark, X } from "@phosphor-icons/react";
import { ipc, type GroupRow, type NodeOut, type QqlRow, type ResultSet, type VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { cn } from "../lib/cn";
import type { TFunc } from "../lib/i18n";
import {
  buildQueryNote,
  defaultQueryName,
  extractQueryFromNote,
  isQueryNode,
  queryNotePath,
} from "../lib/saved-query";

interface Props {
  root: string | null;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
  t: TFunc;
}

const EXAMPLES = [
  `WHERE type = "Concept" SORT mentioned_in.len() DESC SHOW title, status, mentioned_in.len() AS depth`,
  `RENDER count WHERE type = "Concept"`,
  `RENDER group_by(type)`,
  `WHERE status != "done" SORT title ASC SHOW title, status`,
  `RENDER sum(score)`,
];

interface ShowCol {
  label: string;
}

/** 从 SHOW 子句抠列标签(`a AS b` → "b",否则 "a")。 */
function parseShowCols(qql: string): ShowCol[] {
  const m = /\bSHOW\b\s+(.+?)(?:\bRENDER\b|$)/is.exec(qql);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const asM = /\bAS\b\s+(\w+)$/i.exec(raw);
      return { label: asM ? asM[1] : raw };
    });
}

export function QueryPanel({ root, snapshot, actions, t }: Props) {
  const [qql, setQql] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<ResultSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const idToNode = useMemo(() => {
    const m = new Map<number, NodeOut>();
    for (const n of snapshot?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [snapshot]);

  const cols = useMemo(() => parseShowCols(qql), [qql]);

  /** 已保存查询:snapshot 里软类型为 Query 的节点。列表用 title,无需读盘。 */
  const saved = useMemo(
    () => (snapshot?.nodes ?? []).filter(isQueryNode),
    [snapshot],
  );

  /** 跑指定 QQL 文本(支持从已保存查询直接重跑,绕过 state 滞后)。 */
  const runWith = async (text: string) => {
    if (!root) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await ipc.runQql(root, text));
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const run = () => void runWith(qql);

  /** 把当前 QQL 存成 `type: Query` 笔记(自举进图谱/可链接)。 */
  const save = () => {
    const name = window.prompt(t("query.savePrompt"), defaultQueryName(qql));
    if (!name || !name.trim()) return;
    void actions.createNote(queryNotePath(name), buildQueryNote(name, qql));
  };

  /** 载入某条已保存查询的 qql 并立即重跑(只读这一篇)。 */
  const rerun = async (path: string) => {
    if (!root) return;
    try {
      const content = await ipc.readNote(root, path);
      const q = extractQueryFromNote(content);
      if (q) {
        setQql(q);
        await runWith(q);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  /** 删除已保存查询 = 把这篇笔记移入回收站(可恢复)。 */
  const remove = (path: string, title: string) => {
    if (window.confirm(t("query.deleteConfirm", { name: title }))) {
      void actions.trashNote(path);
    }
  };

  return (
    <div className="flex h-full flex-col bg-mantle">
      <div className="border-b border-crust p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-overlay">
          <MagnifyingGlass size={12} />
          {t("query.title")}
        </div>
        <textarea
          value={qql}
          onChange={(e) => setQql(e.target.value)}
          spellCheck={false}
          rows={3}
          className="w-full resize-none rounded bg-crust p-2 font-mono text-[12px] text-text outline-none ring-surface2 focus:ring-1"
          placeholder='WHERE type = "Concept" SORT title ASC SHOW title  ·  RENDER count|group_by(type)|sum(score)'
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            onClick={() => void run()}
            disabled={!root || loading}
            className="flex items-center gap-1 rounded bg-blue px-2.5 py-1 text-[12px] font-medium text-crust disabled:opacity-40"
          >
            <Play size={13} weight="fill" />
            {t("query.run")}
          </button>
          <button
            onClick={save}
            disabled={!root || !qql.trim()}
            title={t("query.save")}
            className="flex items-center gap-1 rounded bg-surface px-2 py-1 text-[12px] text-subtext hover:bg-surface2 disabled:opacity-40"
          >
            <Bookmark size={13} />
            {t("query.save")}
          </button>
          {loading && <span className="text-[11px] text-overlay">{t("query.running")}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQql(ex)}
              className="max-w-[200px] truncate rounded bg-surface px-1.5 py-0.5 text-[10px] text-subtext hover:bg-surface2"
              title={ex}
            >
              {ex.replace(/\s+/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {saved.length > 0 && (
        <div className="border-b border-crust px-2 py-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-overlay">
            {t("query.savedSection")}
          </div>
          <div className="flex flex-wrap gap-1">
            {saved.map((n) => (
              <div
                key={n.id}
                className="group flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-subtext"
              >
                <button
                  onClick={() => void rerun(n.path)}
                  title={t("query.rerun")}
                  className="max-w-[220px] truncate hover:text-text"
                >
                  {n.title}
                </button>
                <button
                  onClick={() => remove(n.path, n.title)}
                  title={t("query.delete")}
                  className="text-overlay opacity-0 hover:text-red group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="m-2 flex items-start gap-1.5 rounded bg-red/10 p-2 text-[12px] text-red">
            <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
            <pre className="whitespace-pre-wrap break-words font-mono">{error}</pre>
          </div>
        )}
        {!error && result && <ResultView result={result} cols={cols} idToNode={idToNode} actions={actions} t={t} />}
      </div>
    </div>
  );
}

function ResultView({
  result,
  cols,
  idToNode,
  actions,
  t,
}: {
  result: ResultSet;
  cols: ShowCol[];
  idToNode: Map<number, NodeOut>;
  actions: VaultActions;
  t: TFunc;
}) {
  const titleOf = (id: number) => idToNode.get(id)?.title ?? String(id);

  if ("Count" in result) {
    return (
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-overlay">{t("query.count")}</div>
        <div className="mt-1 text-3xl font-semibold text-text">{result.Count}</div>
      </div>
    );
  }
  if ("Sum" in result) {
    return (
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-overlay">{t("query.sum")}</div>
        <div className="mt-1 text-3xl font-semibold text-text">
          {Number.isInteger(result.Sum) ? result.Sum : result.Sum.toFixed(2)}
        </div>
      </div>
    );
  }
  if ("Groups" in result) {
    return (
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-mantle text-overlay">
          <tr>
            <th className="border-b border-crust px-3 py-1 text-left font-normal">{t("query.group")}</th>
            <th className="border-b border-crust px-3 py-1 text-right font-normal">{t("query.count")}</th>
          </tr>
        </thead>
        <tbody>
          {result.Groups.map((g: GroupRow) => (
            <tr key={g.key} className="hover:bg-surface">
              <td className="px-3 py-1 text-text">{g.key}</td>
              <td className="px-3 py-1 text-right text-subtext">{g.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if ("List" in result) {
    if (result.List.length === 0) return <Empty t={t} />;
    return (
      <ul>
        {result.List.map((id) => {
          const node = idToNode.get(id);
          return (
            <li key={id}>
              <button
                onClick={() => node && actions.selectNote(node.path)}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface"
              >
                {titleOf(id)}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
  // Table
  if ("Table" in result) {
    if (result.Table.length === 0) return <Empty t={t} />;
    const header = [t("query.noteCol"), ...cols.map((c) => c.label)];
    return (
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-mantle text-overlay">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="border-b border-crust px-2 py-1 text-left font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.Table.map((r: QqlRow) => {
            const node = idToNode.get(r.id);
            const fields = r.fields ?? [];
            return (
              <tr
                key={r.id}
                className="cursor-pointer hover:bg-surface"
                onClick={() => node && actions.selectNote(node.path)}
              >
                <td className="px-2 py-1 text-text">{titleOf(r.id)}</td>
                {cols.map((_, i) => (
                  <td key={i} className={cn("px-2 py-1", fields[i] ? "text-subtext" : "text-overlay")}>
                    {fields[i] ?? "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  return null;
}

function Empty({ t }: { t: TFunc }) {
  return (
    <p className="p-3 text-[12px] text-overlay">
      {t("query.empty")}
    </p>
  );
}
