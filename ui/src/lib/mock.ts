/**
 * mock-tauri —— 浏览器内内存后端。
 *
 * 仅在非 Tauri 环境(纯 `vite dev`)生效,让整条 UI 可在浏览器里跑起来,
 * 无需编译 Rust。这是 Tolaria `src/mock-tauri` 模式的复刻:同一套命令名,
 * 内存实现。
 *
 * 范围:
 * - 文件 CRUD(list/read/write/create/delete):完整支持,内存 Map。
 * - index_vault:用 JS **mini-indexer** 复刻 core 的 frontmatter/标题/wikilink
 *   解析,产出 nodes + edges,让图谱与反链在浏览器里可演示。
 * - run_qql / search_notes:返回空(这两条是 core 的重活,浏览器里不重复实现)。
 *   真机 Tauri 构建里走 Rust core,能力完整。
 *
 * ⚠️ mini-indexer 是 core 的**简化近似**,只为预览;语义以 Rust core 为准。
 */
import type {
  EdgeOut,
  NodeOut,
  VaultEntry,
  VaultSnapshot,
} from "./ipc";

const MOCK_ROOT = "/mock-vault";

/** 种子笔记:一个小型 wiki,带类型/标签/双向链接/悬空链接,覆盖大多数 UI 路径。 */
function seed(): Map<string, string> {
  const notes: Record<string, string> = {
    "index.md": `---
type: Note
tags: [meta]
---

# Index

欢迎来到 OpenObsidian 的 mock vault(浏览器预览模式)。

- 看 [[Zettelkasten]] 方法论
- 看 [[Evergreen Notes]] 的对比
- 提到过一个悬空链接 [[Does Not Exist Yet]]
`,
    "zettelkasten.md": `---
type: Concept
status: Active
tags: [method]
---

# Zettelkasten

原子化卡片笔记法,强调**链接优于分类**。详见 [[Evergreen Notes]] 的对照。

related_to: "[[Index]]"
`,
    "evergreen-notes.md": `---
type: Concept
status: Contested
tags: [method]
---

# Evergreen Notes

Andy Matuschak 提出的常青笔记。与 [[Zettelkasten]] 互为补充但取向不同。

contradicts: "[[Zettelkasten]]"
`,
    "sources/karpathy-llm-wiki.md": `---
type: Source
evidence_tier: analysis
last_verified: 2026-07-25
---

# Karpathy LLM Wiki

一份用 LLM 维护的 wiki 流水线设想。被 [[Zettelkasten]] 提及。
`,
  };
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(notes)) m.set(k, v);
  return m;
}

// 模块级单例 vault。HMR 下保持存活,便于边改 UI 边看效果。
const vault: Map<string, string> = seed();

// ───────────────────── mini-indexer(复刻 core,简化) ─────────────────────

function splitFrontmatter(text: string): { fm: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fm: "", body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

function parseYamlScalar(fm: string): Record<string, unknown> {
  // 极简:只取 `key: value` 与 `key: [a, b]` 两形,够提取 type/tags/status。
  const out: Record<string, unknown> = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, k, raw] = m;
    let v: unknown = raw.trim().replace(/^"(.*)"$/, "$1");
    if (typeof v === "string" && v.startsWith("[") && v.endsWith("]")) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }
    out[k] = v;
  }
  return out;
}

function extractTitle(body: string, path: string): string {
  const m = /^#\s+(.+)$/m.exec(body);
  if (m) return m[1].trim();
  const stem = path.split("/").pop() ?? path;
  return stem.replace(/\.md$/i, "");
}

function pathStem(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** 提取 body 里的 wikilink,跳过 ``` 围栏代码块;返回 [target, anchor] 对。 */
function extractLinks(body: string): Array<[string, string | null]> {
  const out: Array<[string, string | null]> = [];
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const inner = m[1];
      const [target, anchor] = inner.split("|")[0].split("#");
      out.push([target.trim(), anchor ? anchor.trim() : null]);
    }
  }
  return out;
}

/** 关系型 frontmatter 键(出现 [[ ]] 的标量/列表值)→ Relation 边。 */
const RELATION_KEYS = [
  "related_to",
  "belongs_to",
  "has",
  "mentions",
  "contradicts",
  "source",
  "derived_into",
  "mentioned_in",
];

function buildSnapshot(): VaultSnapshot {
  const entries = [...vault.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const parsed = entries.map(([path, text]) => {
    const { fm, body } = splitFrontmatter(text);
    const meta = parseYamlScalar(fm);
    const title = extractTitle(body, path);
    const tagsRaw = meta.tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map(String)
      : typeof tagsRaw === "string" && tagsRaw
        ? [tagsRaw]
        : [];
    const typeStr =
      typeof meta.type === "string" && meta.type ? meta.type : null;
    return { path, text, body, fm, meta, title, tags, typeStr };
  });

  // 解析表:title / path-stem → id(先按 title,再按 stem 补)。
  const byTitle = new Map<string, number>();
  const byStem = new Map<string, number>();
  parsed.forEach((p, i) => {
    if (p.title) byTitle.set(p.title.toLowerCase(), i);
    byStem.set(pathStem(p.path).toLowerCase(), i);
  });
  const resolve = (target: string): number | null =>
    byTitle.get(target.toLowerCase()) ??
    byStem.get(target.toLowerCase()) ??
    null;

  const nodes: NodeOut[] = parsed.map((p, i) => ({
    id: i,
    path: p.path,
    title: p.title,
    type: p.typeStr,
    tags: p.tags,
  }));

  const edges: EdgeOut[] = [];
  parsed.forEach((p, i) => {
    // body wikilinks
    for (const [target, anchor] of extractLinks(p.body)) {
      const to = resolve(target);
      edges.push({
        from: i,
        to,
        unresolved: to === null ? target : null,
        kind: "wiki",
        relation: null,
        anchor,
      });
    }
    // frontmatter relation links
    for (const key of RELATION_KEYS) {
      const val = p.meta[key];
      if (val == null) continue;
      const strs: string[] = Array.isArray(val)
        ? val.map(String)
        : typeof val === "string"
          ? [val]
          : [];
      for (const s of strs) {
        const m = /\[\[([^\]]+)\]\]/.exec(s);
        if (!m) continue;
        const target = m[1].split("|")[0].split("#")[0].trim();
        const to = resolve(target);
        edges.push({
          from: i,
          to,
          unresolved: to === null ? target : null,
          kind: "relation",
          relation: key,
          anchor: null,
        });
      }
    }
  });

  return { root: MOCK_ROOT, nodes, edges };
}

// ───────────────────────── 命令分发 ─────────────────────────

export async function handle<T>(
  cmd: string,
  args: Record<string, unknown>,
): Promise<T> {
  switch (cmd) {
    case "pick_vault":
      return MOCK_ROOT as unknown as T;

    case "list_vault": {
      const entries: VaultEntry[] = [];
      for (const path of [...vault.keys()].sort()) {
        const parts = path.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          entries.push({ path: acc, name: parts[i], is_dir: true });
        }
        entries.push({
          path,
          name: parts[parts.length - 1],
          is_dir: false,
        });
      }
      return entries as unknown as T;
    }

    case "read_note":
      return (vault.get(String(args.path)) ?? "") as unknown as T;

    case "write_note":
    case "create_note":
      vault.set(String(args.path), String(args.content));
      return undefined as unknown as T;

    case "delete_note":
      vault.delete(String(args.path));
      return undefined as unknown as T;

    case "rename_note":
      {
        const c = vault.get(String(args.from));
        if (c !== undefined) {
          vault.delete(String(args.from));
          vault.set(String(args.to), c);
        }
      }
      return undefined as unknown as T;

    case "index_vault":
      return buildSnapshot() as unknown as T;

    case "run_qql":
      // core 的重活不在浏览器里复刻;真机走 Rust。
      console.info("[mock] run_qql 在 mock 模式下返回空,请用 Tauri 构建。");
      return [] as unknown as T;

    case "search_notes":
      console.info(
        "[mock] search_notes 在 mock 模式下返回空,请用 Tauri 构建。",
      );
      return [] as unknown as T;

    default:
      throw new Error(`mock: 未知命令 ${cmd}`);
  }
}
