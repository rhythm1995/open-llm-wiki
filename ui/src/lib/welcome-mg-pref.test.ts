import { describe, it, expect, beforeEach } from "vitest";
import {
  readWelcomeMgPlacement,
  writeWelcomeMgPlacement,
  nextPlacementAfterClose,
  WELCOME_MG_PLACEMENT_KEY,
} from "./welcome-mg-pref";

describe("welcome-mg-pref", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("默认 hero", () => {
    expect(readWelcomeMgPlacement()).toBe("hero");
  });

  it("读写 corner", () => {
    writeWelcomeMgPlacement("corner");
    expect(localStorage.getItem(WELCOME_MG_PLACEMENT_KEY)).toBe("corner");
    expect(readWelcomeMgPlacement()).toBe("corner");
  });

  it("nextPlacementAfterClose", () => {
    expect(nextPlacementAfterClose(true)).toBe("corner");
    expect(nextPlacementAfterClose(false)).toBe("hero");
  });
});
