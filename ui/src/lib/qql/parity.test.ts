/**
 * QQL TS↔Rust 差分:与 fixtures/qql-parity/cases.json 对齐(B-QQL-PARITY-CI)。
 * 通过相对路径 import JSON(与 core/tests/qql_parity.rs 同源文件)。
 */
import { describe, expect, it } from "vitest";
import { parseQql } from "./parse";
import { evalQql } from "./eval";
import type { QqlNote, QqlResultSet } from "./types";
// 从 ui/src/lib/qql → 仓库根 fixtures
import fixtureJson from "../../../../fixtures/qql-parity/cases.json";

interface NoteFile {
  path: string;
  content: string;
}

type Expect =
  | { kind: "list"; paths: string[] }
  | { kind: "count"; n: number }
  | { kind: "sum"; value: number }
  | { kind: "table"; rows: { path: string; fields: (string | null)[] }[] }
  | { kind: "groups"; groups: { key: string; count: number }[] };

interface Case {
  name: string;
  qql: string;
  expect: Expect;
}

interface Fixture {
  notes: NoteFile[];
  cases: Case[];
}

function loadFixture(): Fixture {
  return fixtureJson as Fixture;
}

function splitFm(text: string): { meta: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v: unknown = kv[2].trim().replace(/^"(.*)"$/, "$1");
    if (typeof v === "string" && v.startsWith("[") && v.endsWith("]")) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    } else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
      v = Number(v);
    }
    meta[kv[1]] = v;
  }
  return { meta, body: text.slice(m[0].length) };
}

function titleOf(body: string, path: string): string {
  const h = /^#\s+(.+)$/m.exec(body);
  if (h) return h[1].trim();
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function tagsOf(meta: Record<string, unknown>): string[] {
  const t = meta.tags;
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === "string" && t) return [t];
  return [];
}

function buildNotes(files: NoteFile[]): QqlNote[] {
  // 与 VaultIndex 一致:按 path 字典序编号
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return sorted.map((f, id) => {
    const { meta, body } = splitFm(f.content);
    const type =
      typeof meta.type === "string" && meta.type ? meta.type : null;
    return {
      id,
      path: f.path,
      title: titleOf(body, f.path),
      body,
      frontmatter: meta,
      tags: tagsOf(meta),
      type,
      backlinkCount: 0,
      linkCount: 0,
    };
  });
}

function assertMatch(
  name: string,
  notes: QqlNote[],
  rs: QqlResultSet,
  exp: Expect,
): void {
  const pathOf = (id: number) =>
    notes.find((n) => n.id === id)?.path ?? `#id=${id}`;
  if (exp.kind === "list" && "List" in rs) {
    expect(rs.List.map(pathOf), name).toEqual(exp.paths);
    return;
  }
  if (exp.kind === "count" && "Count" in rs) {
    expect(rs.Count, name).toBe(exp.n);
    return;
  }
  if (exp.kind === "sum" && "Sum" in rs) {
    expect(rs.Sum, name).toBeCloseTo(exp.value, 9);
    return;
  }
  if (exp.kind === "table" && "Table" in rs) {
    expect(rs.Table.length, name).toBe(exp.rows.length);
    exp.rows.forEach((row, i) => {
      expect(pathOf(rs.Table[i].id), name).toBe(row.path);
      expect(rs.Table[i].fields, name).toEqual(row.fields);
    });
    return;
  }
  if (exp.kind === "groups" && ("Groups" in rs || "Histogram" in rs)) {
    const got = ("Groups" in rs ? rs.Groups : rs.Histogram)
      .map((g) => ({ key: g.key, count: g.count }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const want = [...exp.groups].sort((a, b) => a.key.localeCompare(b.key));
    expect(got, name).toEqual(want);
    return;
  }
  throw new Error(`${name}: shape mismatch ${JSON.stringify(rs)}`);
}

describe("qql parity (shared fixture with Rust)", () => {
  const fixture = loadFixture();
  const notes = buildNotes(fixture.notes);

  for (const c of fixture.cases) {
    it(c.name, () => {
      const rs = evalQql(notes, parseQql(c.qql));
      assertMatch(c.name, notes, rs, c.expect);
    });
  }
});
