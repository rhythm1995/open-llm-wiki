/**
 * mock-qql —— 浏览器 dev 下的 **QQL 子集**求值(非 core 移植)。
 *
 * 覆盖日常 preview 够用的形态:
 *   WHERE type = "X" / status = "Y"
 *   WHERE tags 含某 tag(粗: `tags` 字段字符串匹配)
 *   LIMIT n
 *   COUNT
 *   GROUP BY type|status
 *   RENDER histogram(...)  → Histogram
 *   SHOW title, type, status → Table
 *   默认 List
 *
 * 复杂 AND/OR/函数/关系聚合仍返回空或降级,真机走 Rust。
 */
import type { NodeOut, ResultSet } from "./ipc";

export interface MockQqlNode {
  id: number;
  title: string;
  type: string | null;
  tags: string[];
  status: string | null;
  path: string;
}

export function nodesFromOut(nodes: readonly NodeOut[]): MockQqlNode[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type,
    tags: n.tags,
    status: n.status,
    path: n.path,
  }));
}

function parseLimit(q: string): number | null {
  const m = /\bLIMIT\s+(\d+)\b/i.exec(q);
  return m ? Number(m[1]) : null;
}

function parseEq(q: string, field: string): string | null {
  const re = new RegExp(
    `\\b${field}\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const m = re.exec(q);
  return m ? m[1] : null;
}

function parseInList(q: string, field: string): string[] | null {
  const re = new RegExp(
    `\\b${field}\\s+IN\\s*\\(([^)]+)\\)`,
    "i",
  );
  const m = re.exec(q);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseContains(q: string, field: string): string | null {
  const re = new RegExp(
    `\\b${field}\\s+(?:CONTAINS|~)\\s*["']([^"']+)["']`,
    "i",
  );
  return re.exec(q)?.[1] ?? null;
}

function parseStartsWith(q: string, field: string): string | null {
  const re = new RegExp(
    `\\b${field}\\s+STARTSWITH\\s*["']([^"']+)["']`,
    "i",
  );
  return re.exec(q)?.[1] ?? null;
}

function parseEndsWith(q: string, field: string): string | null {
  const re = new RegExp(
    `\\b${field}\\s+ENDSWITH\\s*["']([^"']+)["']`,
    "i",
  );
  return re.exec(q)?.[1] ?? null;
}

function wantsCount(q: string): boolean {
  return /\bCOUNT\b/i.test(q) && !/\bSHOW\b/i.test(q);
}

function groupField(q: string): "type" | "status" | null {
  const m = /\bGROUP\s+BY\s+(type|status)\b/i.exec(q);
  if (m) return m[1].toLowerCase() as "type" | "status";
  const h = /\bRENDER\s+histogram\s*\(\s*(type|status)\s*\)/i.exec(q);
  if (h) return h[1].toLowerCase() as "type" | "status";
  return null;
}

function wantsHistogram(q: string): boolean {
  return /\bRENDER\s+histogram\b/i.test(q);
}

function showFields(q: string): string[] | null {
  const m = /\bSHOW\s+([^\n]+?)(?:\bLIMIT\b|\bSORT\b|\bGROUP\b|\bRENDER\b|$)/i.exec(
    q,
  );
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function filterNodes(q: string, nodes: MockQqlNode[]): MockQqlNode[] {
  let out = [...nodes];
  const typeEq = parseEq(q, "type");
  if (typeEq != null) {
    out = out.filter((n) => (n.type ?? "Note") === typeEq);
  }
  const typeIn = parseInList(q, "type");
  if (typeIn) {
    const set = new Set(typeIn.map((s) => s.toLowerCase()));
    out = out.filter((n) => set.has((n.type ?? "Note").toLowerCase()));
  }
  const statusEq = parseEq(q, "status");
  if (statusEq != null) {
    out = out.filter((n) => (n.status ?? "") === statusEq);
  }
  // tags: 支持 CONTAINS / = "tag" 粗匹配
  const tagEq = parseEq(q, "tags") ?? parseEq(q, "tag");
  if (tagEq != null) {
    const t = tagEq.toLowerCase();
    out = out.filter((n) => n.tags.some((x) => x.toLowerCase() === t));
  }
  const tagContains = /\btags?\s+CONTAINS\s+["']([^"']+)["']/i.exec(q);
  if (tagContains) {
    const t = tagContains[1].toLowerCase();
    out = out.filter((n) =>
      n.tags.some((x) => x.toLowerCase().includes(t)),
    );
  }
  const titleC = parseContains(q, "title");
  if (titleC) {
    const t = titleC.toLowerCase();
    out = out.filter((n) => n.title.toLowerCase().includes(t));
  }
  const pathSw = parseStartsWith(q, "path");
  if (pathSw) {
    const p = pathSw.toLowerCase();
    out = out.filter((n) => n.path.toLowerCase().startsWith(p));
  }
  const pathEw = parseEndsWith(q, "path");
  if (pathEw) {
    const p = pathEw.toLowerCase();
    out = out.filter((n) => n.path.toLowerCase().endsWith(p));
  }
  return out;
}

function fieldOf(n: MockQqlNode, f: string): string | null {
  switch (f) {
    case "title":
      return n.title;
    case "type":
      return n.type;
    case "status":
      return n.status;
    case "path":
      return n.path;
    case "tags":
      return n.tags.join(", ") || null;
    default:
      return null;
  }
}

/**
 * 子集求值。无法识别的复杂查询 → 空 List(与旧 mock 行为兼容,不炸 UI)。
 */
export function mockEvalQql(
  qql: string,
  nodes: readonly MockQqlNode[],
): ResultSet {
  const q = qql.trim();
  if (!q) return { List: [] };

  let filtered = filterNodes(q, [...nodes]);
  const limit = parseLimit(q);
  if (limit != null) filtered = filtered.slice(0, limit);

  const gf = groupField(q);
  if (gf) {
    const map = new Map<string, number[]>();
    for (const n of filtered) {
      const key =
        gf === "type" ? (n.type ?? "Note") : (n.status ?? "—");
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(n.id);
    }
    const groups = [...map.entries()]
      .map(([key, ids]) => ({ key, count: ids.length, ids }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    if (wantsHistogram(q)) return { Histogram: groups };
    return { Groups: groups };
  }

  if (wantsCount(q)) {
    return { Count: filtered.length };
  }

  const fields = showFields(q);
  if (fields && fields.length > 0) {
    return {
      Table: filtered.map((n) => ({
        id: n.id,
        fields: fields.map((f) => fieldOf(n, f)),
      })),
    };
  }

  return { List: filtered.map((n) => n.id) };
}
