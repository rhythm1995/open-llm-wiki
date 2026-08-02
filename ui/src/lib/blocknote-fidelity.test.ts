import { describe, expect, it } from "vitest";
import {
  appLayerSafeFixtureHolds,
  appLayerWikilinkRoundTrip,
  DISABLED_OR_RISKY_PATTERNS,
  frontmatterBodyPreserved,
  SAFE_FIDELITY_FIXTURES,
  safeFixtureHolds,
} from "./blocknote-fidelity";

describe("blocknote-fidelity 双层门禁", () => {
  it("风险模式表非空且无重复", () => {
    expect(DISABLED_OR_RISKY_PATTERNS.length).toBeGreaterThan(2);
    expect(new Set(DISABLED_OR_RISKY_PATTERNS).size).toBe(
      DISABLED_OR_RISKY_PATTERNS.length,
    );
  });

  it("安全样例均过 app 层", () => {
    for (const f of SAFE_FIDELITY_FIXTURES) {
      expect(appLayerSafeFixtureHolds(f), `app:${f.id}`).toBe(true);
    }
  });

  it("安全样例均过完整 gate(app+引擎)", () => {
    for (const f of SAFE_FIDELITY_FIXTURES) {
      expect(safeFixtureHolds(f), `full:${f.id}`).toBe(true);
    }
  });

  it("wikilink app 往返保留 inner", () => {
    const out = appLayerWikilinkRoundTrip("x [[A|b]] y\n");
    expect(out).toContain("[[A|b]]");
  });

  it("frontmatter 合并不丢 body", () => {
    const md = "---\ntype: Note\n---\n# Hi\nbody\n";
    expect(frontmatterBodyPreserved(md)).toBe(true);
  });
});
