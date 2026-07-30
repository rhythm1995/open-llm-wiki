/**
 * 命令过滤 + 文件快开排序 + 搜索结果映射(纯逻辑,可测)。
 */
import type {
  AppCommand,
  FileEntry,
  RankedFile,
  SearchHitView,
} from "./types";

/** 按 query 过滤命令(label / id / keywords / shortcut)。 */
export function filterCommands(
  commands: readonly AppCommand[],
  query: string,
): AppCommand[] {
  const s = query.trim().toLowerCase();
  if (!s) return [...commands];
  return commands.filter((c) => {
    if (c.inPalette === false) return false;
    if (c.label.toLowerCase().includes(s)) return true;
    if (c.id.toLowerCase().includes(s)) return true;
    if (c.shortcut?.toLowerCase().includes(s)) return true;
    if (c.keywords?.some((k) => k.toLowerCase().includes(s))) return true;
    return false;
  });
}

/**
 * 文件快开排序:前缀标题 > 包含标题 > 路径;同分按 path。
 * `recentPaths` 靠前加权。
 */
export function rankFiles(
  files: readonly FileEntry[],
  query: string,
  recentPaths: readonly string[] = [],
  limit = 50,
): RankedFile[] {
  const s = query.trim().toLowerCase();
  const recent = new Map(recentPaths.map((p, i) => [p, recentPaths.length - i]));

  const scored: RankedFile[] = [];
  for (const f of files) {
    const title = f.title.toLowerCase();
    const path = f.path.toLowerCase();
    let score = 0;
    if (!s) {
      score = 1 + (recent.get(f.path) ?? 0) * 0.01;
    } else if (title.startsWith(s)) {
      score = 100;
    } else if (title.includes(s)) {
      score = 60;
    } else if (path.includes(s)) {
      score = 30;
    } else {
      continue;
    }
    score += (recent.get(f.path) ?? 0) * 0.5;
    // 笔记略优先于其它
    if (f.kind === "note") score += 0.1;
    scored.push({ ...f, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
  return scored.slice(0, limit);
}

/** 从 vault entries + 索引节点构造 FileEntry 列表。 */
export function buildFileEntries(
  nodes: readonly { path: string; title: string }[],
  entryPaths: readonly string[] = [],
): FileEntry[] {
  const byPath = new Map<string, FileEntry>();
  for (const n of nodes) {
    byPath.set(n.path, {
      path: n.path,
      title: n.title || baseName(n.path),
      kind: kindOf(n.path),
    });
  }
  for (const p of entryPaths) {
    if (byPath.has(p)) continue;
    if (p.split("/").some((seg) => seg.startsWith("."))) continue;
    const k = kindOf(p);
    if (k === "other") continue;
    byPath.set(p, { path: p, title: baseName(p), kind: k });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function kindOf(path: string): FileEntry["kind"] {
  const l = path.toLowerCase();
  if (l.endsWith(".md")) return "note";
  if (l.endsWith(".canvas")) return "canvas";
  if (l.endsWith(".sheet")) return "sheet";
  return "other";
}

function baseName(path: string): string {
  const leaf = path.split("/").pop() ?? path;
  return leaf.replace(/\.(md|canvas|sheet)$/i, "");
}

/**
 * searchNotes hits + nodes → 展示行(缺 node 的 id 跳过)。
 */
export function mapSearchHits(
  hits: readonly { id: number; score: number }[],
  nodes: readonly {
    id: number;
    path: string;
    title: string;
    preview: string;
  }[],
): SearchHitView[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: SearchHitView[] = [];
  for (const h of hits) {
    const n = byId.get(h.id);
    if (!n) continue;
    out.push({
      id: n.id,
      path: n.path,
      title: n.title,
      preview: n.preview,
      score: h.score,
    });
  }
  return out;
}

/** 菜单/快捷键 dispatch:在命令表中按 id 执行。 */
export function runCommandById(
  commands: readonly AppCommand[],
  id: string,
): boolean {
  const cmd = commands.find((c) => c.id === id);
  if (!cmd) return false;
  cmd.run();
  return true;
}
