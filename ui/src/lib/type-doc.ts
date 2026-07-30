/**
 * type-doc —— 类型文档解析(B-TYPE-DOC,纯逻辑)。
 *
 * 约定(仅 UI 提示,永不 schema 校验):
 *  1. 路径 `types/{Type}.md`(Type 与 frontmatter type 字符串一致)
 *  2. 或 frontmatter `type: TypeDoc` + `for: {Type}`
 *  3. 或 frontmatter `type_document: true` + 标题 === Type
 *
 * 命中后提供 path / title / preview 给 Inspector 展示「关于此类型」。
 */
export interface TypeDocNode {
  id: number;
  path: string;
  title: string;
  type: string | null;
  /** 任意 frontmatter 扁平串表(仅读 for / type_document)。 */
  frontmatter?: Record<string, unknown>;
  preview?: string;
}

export interface TypeDocRef {
  typeName: string;
  path: string;
  title: string;
  id: number;
  /** 短说明(preview 或空)。 */
  hint: string;
}

function fmStr(
  fm: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!fm) return null;
  const v = fm[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

function isTruthy(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "yes" || s === "1";
  }
  return false;
}

/** 规范化类型名作路径段(禁止 `/` `\`)。 */
export function typeDocPathFor(typeName: string): string {
  const safe = typeName.trim().replace(/[/\\]/g, "-");
  return `types/${safe}.md`;
}

/**
 * 在节点列表中解析某 type 的类型文档。
 * 优先级:路径约定 > TypeDoc+for > type_document+标题。
 */
export function resolveTypeDoc(
  typeName: string | null | undefined,
  nodes: readonly TypeDocNode[],
): TypeDocRef | null {
  if (!typeName || !typeName.trim()) return null;
  const name = typeName.trim();
  const wantPath = typeDocPathFor(name).toLowerCase();

  // 1. types/{Type}.md
  for (const n of nodes) {
    if (n.path.toLowerCase() === wantPath) {
      return {
        typeName: name,
        path: n.path,
        title: n.title,
        id: n.id,
        hint: (n.preview ?? "").trim(),
      };
    }
  }

  // 2. type: TypeDoc + for: Type(有 fm 时);或标题 === Type(快照无 fm 时的兜底)
  for (const n of nodes) {
    const t = (n.type ?? "").trim();
    if (t.toLowerCase() !== "typedoc") continue;
    const forType = fmStr(n.frontmatter, "for");
    if (forType === name || (!forType && n.title.trim() === name)) {
      return {
        typeName: name,
        path: n.path,
        title: n.title,
        id: n.id,
        hint: (n.preview ?? "").trim(),
      };
    }
  }

  // 3. type_document: true + title === Type
  for (const n of nodes) {
    if (!isTruthy(n.frontmatter?.type_document)) continue;
    if (n.title.trim() === name) {
      return {
        typeName: name,
        path: n.path,
        title: n.title,
        id: n.id,
        hint: (n.preview ?? "").trim(),
      };
    }
  }

  return null;
}

/** 空类型文档模板正文(新建 types/X.md 时用)。 */
export function emptyTypeDocContent(typeName: string): string {
  const t = typeName.trim() || "Note";
  return `---
type: TypeDoc
for: ${t}
---

# ${t}

关于 \`${t}\` 类型的约定与字段说明(仅提示,不强制校验)。

## 建议字段

- \`status\`
- \`tags\`

## 示例

写一篇 \`${t}\` 笔记时……
`;
}
