import { describe, it, expect } from "vitest";
import { sampleVaultNotes, SAMPLE_VAULT_MOCK_ROOT } from "./sample-vault";

describe("sampleVaultNotes", () => {
  it("至少含 Welcome 与带 wikilink 的概念页", () => {
    const notes = sampleVaultNotes();
    expect(notes.length).toBeGreaterThanOrEqual(3);
    const paths = notes.map((n) => n.path);
    expect(paths).toContain("Welcome.md");
    const body = notes.map((n) => n.content).join("\n");
    expect(body).toMatch(/\[\[/);
    expect(body).toMatch(/type:\s*Concept/);
  });

  it("mock 根路径稳定", () => {
    expect(SAMPLE_VAULT_MOCK_ROOT).toBe("/sample-vault");
  });
});
