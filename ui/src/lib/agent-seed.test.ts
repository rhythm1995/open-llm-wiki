import { describe, it, expect, beforeEach } from "vitest";
import {
  markAgentSeedConsumed,
  isAgentSeedConsumed,
  resetAgentSeedConsumedForTests,
} from "./agent-seed";

describe("agent-seed consumed tokens", () => {
  beforeEach(() => resetAgentSeedConsumedForTests());

  it("marks and queries", () => {
    expect(isAgentSeedConsumed(1)).toBe(false);
    markAgentSeedConsumed(1);
    expect(isAgentSeedConsumed(1)).toBe(true);
    expect(isAgentSeedConsumed(2)).toBe(false);
  });

  it("evicts oldest when over cap", () => {
    for (let i = 0; i < 33; i++) markAgentSeedConsumed(i);
    expect(isAgentSeedConsumed(0)).toBe(false);
    expect(isAgentSeedConsumed(1)).toBe(true);
    expect(isAgentSeedConsumed(32)).toBe(true);
  });
});
