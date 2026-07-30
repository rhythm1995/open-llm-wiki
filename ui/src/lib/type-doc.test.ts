import { describe, expect, it } from "vitest";
import {
  emptyTypeDocContent,
  resolveTypeDoc,
  typeDocPathFor,
  type TypeDocNode,
} from "./type-doc";

const nodes: TypeDocNode[] = [
  {
    id: 1,
    path: "types/Concept.md",
    title: "Concept",
    type: "TypeDoc",
    frontmatter: { for: "Concept" },
    preview: "概念说明",
  },
  {
    id: 2,
    path: "meta/Entity.md",
    title: "Entity",
    type: null,
    frontmatter: { type_document: true },
    preview: "实体约定",
  },
  {
    id: 3,
    path: "n.md",
    title: "Note",
    type: "Note",
    preview: "普通笔记",
  },
];

describe("typeDocPathFor", () => {
  it("拼 types/ 路径", () => {
    expect(typeDocPathFor("Concept")).toBe("types/Concept.md");
  });
});

describe("resolveTypeDoc", () => {
  it("优先路径约定", () => {
    const r = resolveTypeDoc("Concept", nodes);
    expect(r?.path).toBe("types/Concept.md");
    expect(r?.hint).toBe("概念说明");
  });

  it("type_document + 标题", () => {
    const r = resolveTypeDoc("Entity", nodes);
    expect(r?.path).toBe("meta/Entity.md");
  });

  it("无则 null;空 type null", () => {
    expect(resolveTypeDoc("Missing", nodes)).toBeNull();
    expect(resolveTypeDoc(null, nodes)).toBeNull();
  });
});

describe("emptyTypeDocContent", () => {
  it("含 TypeDoc frontmatter", () => {
    const c = emptyTypeDocContent("Summary");
    expect(c).toContain("type: TypeDoc");
    expect(c).toContain("for: Summary");
    expect(c).toContain("# Summary");
  });
});
