import { describe, expect, it } from "vitest";
import {
  appLayerWikilinkRoundTrip,
  DISABLED_OR_RISKY_PATTERNS,
  frontmatterBodyPreserved,
  SAFE_FIDELITY_FIXTURES,
  safeFixtureHolds,
} from "./blocknote-fidelity";

describe("blocknote-fidelity gate", () => {
  it("声明禁用/风险模式表非空", () => {
    expect(DISABLED_OR_RISKY_PATTERNS.length).toBeGreaterThan(2);
  });

  it("安全样例均通过 gate", () => {
    for (const f of SAFE_FIDELITY_FIXTURES) {
      expect(safeFixtureHolds(f), f.id).toBe(true);
    }
  });

  it("wikilink round-trip 保留 inner", () => {
    const out = appLayerWikilinkRoundTrip("x [[A|b]] y\n");
    expect(out).toContain("[[A|b]]");
  });

  it("frontmatter 合并不丢 body", () => {
    const md = "---\ntype: Note\n---\n# Hi\nbody\n";
    expect(frontmatterBodyPreserved(md)).toBe(true);
  });
});
