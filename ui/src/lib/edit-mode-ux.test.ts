import { describe, expect, it } from "vitest";
import {
  modeFidelityHintKey,
  shouldShowModeFidelityHint,
} from "./edit-mode-ux";

describe("edit-mode-ux", () => {
  it("仅 source→wysiwyg 提示", () => {
    expect(shouldShowModeFidelityHint("source", "wysiwyg")).toBe(true);
    expect(shouldShowModeFidelityHint("wysiwyg", "source")).toBe(false);
    expect(shouldShowModeFidelityHint("source", "source")).toBe(false);
  });

  it("hint key", () => {
    expect(modeFidelityHintKey("source", "wysiwyg")).toBe(
      "editor.mode.fidelityHint",
    );
    expect(modeFidelityHintKey("wysiwyg", "source")).toBeNull();
  });
});
