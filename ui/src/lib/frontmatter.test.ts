import { describe, it, expect } from "vitest";
import {
  splitFrontmatter,
  mergeFrontmatter,
  parseFrontmatterEntries,
  setFrontmatterValue,
  removeFrontmatterKey,
} from "./frontmatter";

const WITH_FM = `---\ntype: Concept\nstatus: Active\ntags: [method, note]\n---\n\n# Title\n\nbody text\n`;
const NO_FM = `# Title\n\nbody text\n`;
const MULTILINE_LIST = `---\ntags:\n  - method\n  - note\nstatus: Active\n---\n\nbody\n`;

describe("splitFrontmatter", () => {
  it("detects a leading frontmatter block", () => {
    const { hasFm, fm, body } = splitFrontmatter(WITH_FM);
    expect(hasFm).toBe(true);
    expect(fm).toBe("type: Concept\nstatus: Active\ntags: [method, note]");
    expect(body).toBe("\n# Title\n\nbody text\n");
  });

  it("reports no frontmatter", () => {
    const { hasFm, body } = splitFrontmatter(NO_FM);
    expect(hasFm).toBe(false);
    expect(body).toBe(NO_FM);
  });

  it("does not treat a mid-document fence as frontmatter", () => {
    const txt = "# T\n\n---\n\nnot fm\n";
    expect(splitFrontmatter(txt).hasFm).toBe(false);
  });
});

describe("mergeFrontmatter", () => {
  it("is a round-trip inverse of splitFrontmatter (with fm)", () => {
    const { hasFm, fm, body } = splitFrontmatter(WITH_FM);
    expect(mergeFrontmatter(hasFm, fm, body)).toBe(WITH_FM);
  });

  it("is a round-trip inverse for a multi-line sequence frontmatter", () => {
    const { hasFm, fm, body } = splitFrontmatter(MULTILINE_LIST);
    expect(mergeFrontmatter(hasFm, fm, body)).toBe(MULTILINE_LIST);
  });

  it("returns body as-is when there is no frontmatter", () => {
    expect(mergeFrontmatter(false, "", NO_FM)).toBe(NO_FM);
  });

  it("does not wrap an empty fm in fences", () => {
    expect(mergeFrontmatter(true, "   \n  ", "body")).toBe("body");
  });

  it("merges an unchanged fm with a new body (WysiwygView 回写场景)", () => {
    // 编辑器只改 body;fm 段从最新 content 取,原样保留。
    const { hasFm, fm } = splitFrontmatter(WITH_FM);
    const out = mergeFrontmatter(hasFm, fm, "\n# New\n\nedited body\n");
    expect(splitFrontmatter(out).fm).toBe(fm);
    expect(splitFrontmatter(out).body).toBe("\n# New\n\nedited body\n");
  });
});

describe("parseFrontmatterEntries", () => {
  it("preserves key order and parses scalars + inline lists", () => {
    const entries = parseFrontmatterEntries(WITH_FM);
    expect(entries).toEqual([
      ["type", "Concept"],
      ["status", "Active"],
      ["tags", ["method", "note"]],
    ]);
  });

  it("parses a multi-line sequence into an array", () => {
    const entries = parseFrontmatterEntries(MULTILINE_LIST);
    expect(entries).toEqual([
      ["tags", ["method", "note"]],
      ["status", "Active"],
    ]);
  });

  it("returns empty for no frontmatter", () => {
    expect(parseFrontmatterEntries(NO_FM)).toEqual([]);
  });
});

describe("setFrontmatterValue", () => {
  it("creates a frontmatter block when none exists", () => {
    const out = setFrontmatterValue(NO_FM, "type", "Note");
    const { hasFm, body } = splitFrontmatter(out);
    expect(hasFm).toBe(true);
    expect(body).toBe(NO_FM);
    expect(parseFrontmatterEntries(out)).toEqual([["type", "Note"]]);
  });

  it("replaces an existing scalar in place, keeping order", () => {
    const out = setFrontmatterValue(WITH_FM, "status", "Done");
    expect(parseFrontmatterEntries(out)).toEqual([
      ["type", "Concept"],
      ["status", "Done"],
      ["tags", ["method", "note"]],
    ]);
  });

  it("replaces an inline list", () => {
    const out = setFrontmatterValue(WITH_FM, "tags", ["a", "b"]);
    expect(parseFrontmatterEntries(out)).toEqual([
      ["type", "Concept"],
      ["status", "Active"],
      ["tags", ["a", "b"]],
    ]);
  });

  it("collapses a multi-line sequence into inline form on replace", () => {
    const out = setFrontmatterValue(MULTILINE_LIST, "tags", ["x", "y"]);
    // 不留孤儿 `- ` 行;status 仍在。
    expect(parseFrontmatterEntries(out)).toEqual([
      ["tags", ["x", "y"]],
      ["status", "Active"],
    ]);
    expect(out).not.toContain("- x");
  });

  it("appends a new key when frontmatter exists", () => {
    const out = setFrontmatterValue(WITH_FM, "author", "bugzhang");
    const entries = parseFrontmatterEntries(out);
    expect(entries[entries.length - 1]).toEqual(["author", "bugzhang"]);
  });

  it("quotes values that need quoting (colon, number, empty, bool)", () => {
    expect(splitFrontmatter(setFrontmatterValue(NO_FM, "k", "a: b")).fm).toContain('k: "a: b"');
    expect(splitFrontmatter(setFrontmatterValue(NO_FM, "k", "123")).fm).toContain('k: "123"');
    expect(splitFrontmatter(setFrontmatterValue(NO_FM, "k", "")).fm).toContain('k: ""');
    expect(splitFrontmatter(setFrontmatterValue(NO_FM, "k", "true")).fm).toContain('k: "true"');
  });

  it("leaves plain-word values unquoted", () => {
    expect(splitFrontmatter(setFrontmatterValue(NO_FM, "k", "Concept")).fm).toContain("k: Concept");
  });

  it("does not alter the body", () => {
    const out = setFrontmatterValue(WITH_FM, "status", "Done");
    expect(splitFrontmatter(out).body).toBe(splitFrontmatter(WITH_FM).body);
  });
});

describe("removeFrontmatterKey", () => {
  it("removes a scalar key", () => {
    const out = removeFrontmatterKey(WITH_FM, "status");
    expect(parseFrontmatterEntries(out)).toEqual([
      ["type", "Concept"],
      ["tags", ["method", "note"]],
    ]);
  });

  it("removes a multi-line sequence block (no orphan lines)", () => {
    const out = removeFrontmatterKey(MULTILINE_LIST, "tags");
    expect(parseFrontmatterEntries(out)).toEqual([["status", "Active"]]);
    expect(out).not.toContain("- method");
  });

  it("is a no-op when the key is absent", () => {
    expect(removeFrontmatterKey(WITH_FM, "nope")).toBe(WITH_FM);
  });
});
