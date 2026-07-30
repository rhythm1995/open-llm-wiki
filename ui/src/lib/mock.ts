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
 * - search_notes:极简 AND 检索(标题×2 加权,见 mock-search.ts),近似 core 供预览。
 * - run_qql:浏览器用 mock-qql **子集**(type/status/tag/LIMIT/COUNT/GROUP/histogram);
 *   复杂查询降级空 List。完整语义真机走 Rust core。
 *
 * ⚠️ mini-indexer 是 core 的**简化近似**,只为预览;语义以 Rust core 为准。
 */
import type {
  EdgeOut,
  NodeOut,
  VaultEntry,
  VaultSnapshot,
} from "./ipc";
import { mockSearch } from "./mock-search";
import { mockEvalQql, nodesFromOut } from "./mock-qql";

const MOCK_ROOT = "/mock-vault";

/**
 * 附件内存仓(path → data URL)。浏览器 mock 无 fs,粘贴图片落此处供预览。
 * 与笔记 Map 分离(二进制不进 mini-indexer)。
 */
const attachments = new Map<string, string>();

/** 是否已有该相对路径附件(uniqueAttachmentPath 用)。 */
export function attachmentExists(relPath: string): boolean {
  return attachments.has(relPath.replace(/\\/g, "/"));
}

/** 解析 mock 附件 URL;未缓存返回空串(阅读侧表现为破图)。 */
export function resolveAttachmentUrl(relPath: string): string {
  return attachments.get(relPath.replace(/\\/g, "/")) ?? "";
}

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
    // 模板示例:演示 F-TEMPLATES(`{{title}}` / `{{date}}` 占位符)。
    "templates/concept.md": `---
type: Concept
status: Active
tags: []
created: {{date}}
---

# {{title}}

`,
    "templates/source.md": `---
type: Source
evidence_tier: analysis
last_verified: {{date}}
---

# {{title}}

> 摘要占位。

`,
    // F-CANVAS 演示:空白 Excalidraw 画布(空串 = 新画布;首次落笔后存 schema JSON)。
    "whiteboard.canvas": "",
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

/**
 * 正文单行预览(与 Rust `preview_of` 对齐):去掉开头与 title 重复的 H1 行,
 * 空白压成单空格,超过 200 字符截断加 …。mock 无 fs,仅做文本处理。
 */
function previewOf(body: string): string {
  const trimmed = body.trimStart();
  let rest = trimmed;
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  if (firstLine && /^#{1,6}\s/.test(firstLine)) {
    rest = trimmed.slice(firstLine.length).trimStart();
  }
  const single = rest.split(/\s+/).filter(Boolean).join(" ");
  const LIMIT = 200;
  const chars = [...single];
  if (chars.length <= LIMIT) return single;
  return chars.slice(0, LIMIT).join("") + "…";
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

interface Parsed {
  path: string;
  text: string;
  body: string;
  fm: string;
  meta: Record<string, unknown>;
  title: string;
  tags: string[];
  typeStr: string | null;
  statusStr: string | null;
  createdStr: string | null;
  preview: string;
}

/** 路径任一段以点开头(`.trash`、`.obsidian` 等)即视为隐藏——与 Rust `build_index`/
 *  `list_vault` 的 `filter_entry` 一致,使回收站与隐藏配置不进图谱/检索/列表。 */
function hasDotSegment(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith("."));
}

/** Parsed → NodeOut 投影(主索引与回收站共用)。mock 无 fs,modified 取当前时间近似。 */
function parsedToNode(p: Parsed, i: number): NodeOut {
  return {
    id: i,
    path: p.path,
    title: p.title,
    type: p.typeStr,
    tags: p.tags,
    status: p.statusStr,
    created: p.createdStr,
    // mock 无 fs;用当前时间近似 modified(真机走 Rust 的 fs::metadata)。
    modified: Date.now(),
    preview: p.preview,
  };
}

/** 解析满足 `include` 的 .md 笔记(按路径排序;node id 即下标)。
 *  仅取 `.md`;`.canvas`(Excalidraw JSON)不当作 markdown 解析,避免把 JSON
 *  误当 frontmatter / wikilink 污染图谱。画布在文件树里仍可见(list_vault 不过滤)。 */
function parsePaths(include: (path: string) => boolean): Parsed[] {
  const entries = [...vault.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(
      ([path]) => path.toLowerCase().endsWith(".md") && include(path),
    );
  return entries.map(([path, text]) => {
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
    const statusStr =
      typeof meta.status === "string" && meta.status ? meta.status : null;
    const createdStr =
      typeof meta.created === "string" && meta.created ? meta.created : null;
    return {
      path,
      text,
      body,
      fm,
      meta,
      title,
      tags,
      typeStr,
      statusStr,
      createdStr,
      preview: previewOf(body),
    };
  });
}

function buildSnapshot(): VaultSnapshot {
  const parsed = parsePaths((p) => !hasDotSegment(p));

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

  const nodes: NodeOut[] = parsed.map(parsedToNode);

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
      // 与 Rust 一致:隐藏任何点开头的路径段(含 .trash、.obsidian 等)。
      for (const path of [...vault.keys()].sort()) {
        if (path.split("/").some((seg) => seg.startsWith("."))) continue;
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

    case "save_attachment": {
      // 内存存 data URL,阅读/并排预览用 resolveAttachmentUrl。
      const path = String(args.path).replace(/\\/g, "/");
      let b64 = String(args.bytes_base64 ?? "");
      let mime = "image/png";
      if (b64.startsWith("data:")) {
        const m = /^data:([^;]+);base64,(.+)$/i.exec(b64);
        if (m) {
          mime = m[1] || mime;
          b64 = m[2];
        } else {
          const i = b64.indexOf("base64,");
          if (i >= 0) b64 = b64.slice(i + "base64,".length);
        }
      }
      // 按扩展名猜 mime(若 data URL 未带)。
      if (!String(args.bytes_base64 ?? "").startsWith("data:")) {
        const lower = path.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
        else if (lower.endsWith(".gif")) mime = "image/gif";
        else if (lower.endsWith(".webp")) mime = "image/webp";
        else if (lower.endsWith(".svg")) mime = "image/svg+xml";
      }
      attachments.set(path, `data:${mime};base64,${b64}`);
      return undefined as unknown as T;
    }

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
      // force 在 mock 无差异(内存 map 即真相)。
      return buildSnapshot() as unknown as T;

    case "apply_vault_changes":
      // mock 无外部 fs;路径 delta 忽略,返回当前快照(与 live 投影同形)。
      return buildSnapshot() as unknown as T;

    case "run_qql": {
      // 子集求值供 vite dev / 内联 qql 预览;完整语义仍以 Rust 为准。
      const snap = buildSnapshot();
      return mockEvalQql(
        String(args.qql ?? ""),
        nodesFromOut(snap.nodes),
      ) as unknown as T;
    }

    case "search_notes": {
      // 浏览器 mock:极简 AND 检索(标题×2 加权),近似 core 仅供预览。
      const docs = parsePaths((p) => !hasDotSegment(p)).map((p, i) => ({
        id: i,
        title: p.title,
        body: p.body,
      }));
      return mockSearch(docs, String(args.query)) as unknown as T;
    }

    // git(F-GIT):浏览器 mock 无 git;返回空 status/log 让面板可渲染预览,
    // commit 明确报错(面板在 mock 模式下会显示提示横幅)。
    case "git_status_raw":
    case "git_log_raw":
      return "" as unknown as T;
    case "git_commit":
    case "git_pull":
    case "git_push":
      throw new Error("mock 模式下 git 不可用;请在桌面 app 中打开 git 仓库。");

    // 归档并入 git:mock 下不是 git 仓库 → ArchiveView 渲染非 git 空态(mock 提示)。
    // 还原/初始化同样不可用(与 git_commit 一致)。
    case "git_is_repo":
      return false as unknown as T;
    case "git_deleted_notes":
      return [] as unknown as T;
    case "git_restore_note":
    case "git_init":
      throw new Error("mock 模式下 git 不可用;请在桌面 app 中打开 git 仓库。");

    case "watch_vault":
    case "unwatch_vault":
      // mock 无 OS fs,不监听;种子静态,浏览器 dev 靠手动 refresh。
      return undefined as unknown as T;

    default:
      throw new Error(`mock: 未知命令 ${cmd}`);
  }
}
