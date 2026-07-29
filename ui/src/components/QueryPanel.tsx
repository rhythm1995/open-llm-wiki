/**
 * QueryPanel —— 差异化之二:QQL 查询面板。
 *
 * 用户输入 QQL(类 DQL 文本),调 run_qql 走 Rust core 求值,渲染结果表。
 * 这是 Obsidian 不具备的"原生实时查询"卖点:把 frontmatter/标签/全文当作可查询数据。
 *
 * 客户端只做两件轻活:从 QQL 文本里抠出 SHOW 列(给表头),以及把行 id 映射回节点标题。
 * 求值与语法完全在 core(qql::parse + query::eval),保证 UI 与 core 语义一致。
 */
import { useMemo, useState } from "react";
import { Play, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { ipc, type QqlRow, type VaultSnapshot } from "../lib/ipc";
import type { VaultActions } from "../lib/store";
import { cn } from "../lib/cn";

interface Props {
  root: string | null;
  snapshot: VaultSnapshot | null;
  actions: VaultActions;
}

const EXAMPLES = [
  `WHERE type = "Concept" SORT title ASC SHOW title, status`,
  `WHERE tags CONTAINS "method" SHOW title`,
  `WHERE title ~ "note" SHOW title, type`,
  `SORT title ASC LIMIT 5 SHOW title, type`,
];

function parseShowCols(qql: string): string[] {
  const m = /\bSHOW\b\s+(.+)$/is.exec(qql);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function QueryPanel({ root, snapshot, actions }: Props) {
  const [qql, setQql] = useState(EXAMPLES[0]);
  const [rows, setRows] = useState<QqlRow[] | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const idToNode = useMemo(() => {
    const m = new Map<number, { title: string; path: string }>();
    for (const n of snapshot?.nodes ?? []) {
      m.set(n.id, { title: n.title, path: n.path });
    }
    return m;
  }, [snapshot]);

  const run = async () => {
    if (!root) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.runQql(root, qql);
      setRows(result);
      setCols(parseShowCols(qql));
    } catch (e) {
      setError(String(e));
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const headerCols = ["笔记", ...cols];

  return (
    <div className="flex h-full flex-col bg-mantle">
      <div className="border-b border-crust p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-overlay">
          <MagnifyingGlass size={12} />
          QQL 查询
        </div>
        <textarea
          value={qql}
          onChange={(e) => setQql(e.target.value)}
          spellCheck={false}
          rows={3}
          className="w-full resize-none rounded bg-crust p-2 font-mono text-[12px] text-text outline-none ring-surface2 focus:ring-1"
          placeholder='WHERE type = "Concept" SORT title ASC SHOW title'
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            onClick={() => void run()}
            disabled={!root || loading}
            className="flex items-center gap-1 rounded bg-blue px-2.5 py-1 text-[12px] font-medium text-crust disabled:opacity-40"
          >
            <Play size={13} weight="fill" />
            运行
          </button>
          {loading && <span className="text-[11px] text-overlay">运行中…</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQql(ex)}
              className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-subtext hover:bg-surface2"
              title={ex}
            >
              {ex.replace(/\s+/g, " ").slice(0, 28)}…
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="flex items-start gap-1.5 m-2 rounded bg-red/10 p-2 text-[12px] text-red">
            <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
            <pre className="whitespace-pre-wrap break-words font-mono">
              {error}
            </pre>
          </div>
        )}
        {!error && rows && rows.length === 0 && (
          <p className="p-3 text-[12px] text-overlay">
            无匹配行。(mock 浏览器模式下 QQL 返回空 —— 请用 Tauri 构建以获得完整求值。)
          </p>
        )}
        {!error && rows && rows.length > 0 && (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-mantle text-overlay">
              <tr>
                {headerCols.map((c, i) => (
                  <th
                    key={i}
                    className="border-b border-crust px-2 py-1 text-left font-normal"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const node = idToNode.get(r.id);
                const fields = r.fields ?? [];
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-surface"
                    onClick={() => node && actions.selectNote(node.path)}
                  >
                    <td className="px-2 py-1 text-text">{node?.title ?? r.id}</td>
                    {cols.map((_, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-2 py-1",
                          fields[i] ? "text-subtext" : "text-overlay",
                        )}
                      >
                        {fields[i] ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
