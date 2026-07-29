/**
 * frontmatter.ts —— 前端侧 frontmatter 编辑的纯逻辑(可测、无 React)。
 *
 * 设计取向:
 * - **行级最小侵入**:编辑/删除时只动命中的 key 块(含其多行序列续行),其余字节原样保留,
 *   避免重排用户的手写 frontmatter(注释、空行、键序)。
 * - **序列化用内联 `[a, b]`**:无论是新增还是替换多行序列,都写成内联形,简洁且 core 的
 *   serde_yaml 能正确解析。多行形只是读取兼容,不产出。
 * - **按需加引号**:裸词不加引号(`type: Concept`),但含 YAML 特殊字符、数字、布尔、
 *   空串的值加双引号,避免被 serde_yaml 错误强制类型(如 `status: 123` 被读成整数)。
 *
 * 这是 F-PROPERTIES(属性面板可视化编辑)的纯逻辑核心;UI 只负责调用并把结果喂给
 * autosave。语义仍以 Rust core 的解析为准,这里只是"尽量不破坏"的编辑器。
 */

export type FmValue = string | string[];

/** 一条 frontmatter 键值(有序;列表值为 string[])。 */
export type FmEntry = [key: string, value: FmValue];

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const KEY_RE = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;
const INDENTED_RE = /^\s+\S/;
const SEQ_ITEM_RE = /^\s+-\s+/;

/** 拆出 frontmatter 内文与正文;无 frontmatter 时 hasFm=false、body=原文。 */
export function splitFrontmatter(content: string): {
  hasFm: boolean;
  fm: string;
  body: string;
} {
  const m = FM_RE.exec(content);
  if (!m) return { hasFm: false, fm: "", body: content };
  return { hasFm: true, fm: m[1], body: content.slice(m[0].length) };
}

/**
 * 合并 frontmatter 内文与正文为完整笔记(与 {@link splitFrontmatter} 对偶)。
 * WysiwygView 用它把 BlockNote 序列化出的 body 与(从最新 content 取的)frontmatter
 * 拼回——frontmatter 段永远跟随 store 真相,body 段永远跟随编辑器,两者解耦。
 * hasFm=false 或 fm 空白时直接返回 body(不强行套一层空围栏),保 round-trip。
 */
export function mergeFrontmatter(hasFm: boolean, fm: string, body: string): string {
  if (!hasFm || fm.trim() === "") return body;
  return reassemble(fm, body);
}

/** 去掉首尾配对的单/双引号。 */
function unquote(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 内联值:wikilink 标量保留;内联列表 → string[];否则标量(去引号)。 */
function parseInlineValue(raw: string): FmValue {
  const v = raw.trim();
  // `[[wikilink]]` 是标量,不是内联数组——否则 slice(1,-1) 会把它误拆成 ["[wikilink]"]。
  if (v.startsWith("[[") && v.endsWith("]]")) {
    return v;
  }
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => unquote(s.trim()))
      .filter((s) => s !== "");
  }
  return unquote(v);
}

/** 把 frontmatter 内文解析成有序键值列表(兼容内联列表与多行序列)。 */
export function parseFrontmatterEntries(content: string): FmEntry[] {
  const { hasFm, fm } = splitFrontmatter(content);
  if (!hasFm) return [];
  const lines = fm.split(/\r?\n/);
  const out: FmEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = KEY_RE.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const [, key, raw] = m;
    const rest = raw.trim();
    if (rest === "") {
      // 多行序列:吞掉后续 `  - item` 行。
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && SEQ_ITEM_RE.test(lines[j])) {
        items.push(unquote(lines[j].replace(SEQ_ITEM_RE, "").trim()));
        j++;
      }
      if (items.length > 0) {
        out.push([key, items]);
        i = j;
      } else {
        out.push([key, ""]);
        i++;
      }
      continue;
    }
    out.push([key, parseInlineValue(rest)]);
    i++;
  }
  return out;
}

/** 对象视图(App 展示用;遇同键后者覆盖,丢失顺序)。无 frontmatter 返回 null。 */
export function parseFrontmatterObject(content: string): Record<string, unknown> | null {
  const entries = parseFrontmatterEntries(content);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

const YAML_SPECIAL = /[:#\[\]{},&*!|>'"%@`]/;

/** 是否需要加引号以避免 YAML 类型强制或语法破坏。 */
function needsQuoting(s: string): boolean {
  if (s === "") return true;
  if (/^\s|\s$/.test(s)) return true;
  if (YAML_SPECIAL.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  return false;
}

function formatScalar(s: string): string {
  return needsQuoting(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}

/** 序列化一个值为 frontmatter 行尾:`[a, b]` 或标量。 */
export function formatValue(v: FmValue): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[${v.map(formatScalar).join(", ")}]`;
  }
  return formatScalar(v);
}

/** 拼回完整笔记:`---\n{fm}\n---\n{body}`(body 原样)。 */
function reassemble(fmInner: string, body: string): string {
  return `---\n${fmInner}\n---\n${body}`;
}

/** 在 frontmatter 内文里定位 key 的行块 [start, end)(含其缩进续行);未命中返回 null。 */
function locateKeyBlock(lines: string[], key: string): [number, number] | null {
  for (let i = 0; i < lines.length; i++) {
    const m = KEY_RE.exec(lines[i]);
    if (!m || m[1] !== key) continue;
    let j = i + 1;
    while (j < lines.length && INDENTED_RE.test(lines[j])) j++;
    return [i, j];
  }
  return null;
}

/**
 * 设置/替换一个 frontmatter 键。
 * - 无 frontmatter → 顶部新建块,body 原样。
 * - 命中 → 替换该 key 块(多行序列被收成内联形)。
 * - 未命中 → 追加到块末尾。
 */
export function setFrontmatterValue(content: string, key: string, value: FmValue): string {
  const { hasFm, fm, body } = splitFrontmatter(content);
  const line = `${key}: ${formatValue(value)}`;
  if (!hasFm) {
    return reassemble(line, body);
  }
  const lines = fm.split(/\r?\n/);
  const span = locateKeyBlock(lines, key);
  const next = span
    ? [...lines.slice(0, span[0]), line, ...lines.slice(span[1])]
    : [...lines, line];
  return reassemble(next.join("\n"), body);
}

/** 删除一个 frontmatter 键(含其多行续行)。未命中 → 原样返回。 */
export function removeFrontmatterKey(content: string, key: string): string {
  const { hasFm, fm, body } = splitFrontmatter(content);
  if (!hasFm) return content;
  const lines = fm.split(/\r?\n/);
  const span = locateKeyBlock(lines, key);
  if (!span) return content;
  const next = [...lines.slice(0, span[0]), ...lines.slice(span[1])];
  return reassemble(next.join("\n"), body);
}

const WIKILINK_RE = /^\[\[(.+)\]\]$/;

/** 取 `[[target|alias#anchor]]` 内层的 target(去 alias/anchor);非 wikilink 原样返回。 */
function linkInnerTarget(inner: string): string {
  return inner.split("|")[0].split("#")[0].trim();
}

/**
 * 判断一个 frontmatter 值是否是关系字段值——标量 `[[wikilink]]`,或全部元素都是
 * `[[wikilink]]` 的序列。对标 core 的 relationship_links 规则(Tolaria ADR-0010:
 * 任何值为 wikilink 的字段都视为关系),供 Inspector 把这类字段渲染成可补全的 chip。
 */
export function isRelationValue(v: FmValue): boolean {
  if (typeof v === "string") return WIKILINK_RE.test(v);
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => WIKILINK_RE.test(x));
  return false;
}

/** 关系字段值 → 显示用的 target 列表(已剥离 `[[]]`/alias/anchor);非关系值返回 []。 */
export function relationTargets(v: FmValue): string[] {
  if (typeof v === "string") {
    const m = WIKILINK_RE.exec(v);
    return m ? [linkInnerTarget(m[1])] : [];
  }
  if (Array.isArray(v)) {
    return v.flatMap((x) => {
      const m = WIKILINK_RE.exec(x);
      return m ? [linkInnerTarget(m[1])] : [];
    });
  }
  return [];
}

/** 把 target 包成 `[[target]]`(关系 chip 写回 frontmatter 用)。 */
export function asWikilink(target: string): string {
  return `[[${target}]]`;
}
