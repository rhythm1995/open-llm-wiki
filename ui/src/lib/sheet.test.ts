import { describe, expect, it } from "vitest";
import {
  cellRef,
  colToLetters,
  createEmptySheet,
  evalCell,
  isSheetPath,
  parseSheet,
  serializeSheet,
  setCell,
} from "./sheet";

describe("sheet paths / schema", () => {
  it("isSheetPath", () => {
    expect(isSheetPath("a.sheet")).toBe(true);
    expect(isSheetPath("a.md")).toBe(false);
  });

  it("roundtrip", () => {
    let doc = createEmptySheet();
    doc = setCell(doc, "A1", "10");
    doc = setCell(doc, "B1", "=A1+5");
    const again = parseSheet(serializeSheet(doc));
    expect(again.cells.A1).toBe("10");
    expect(evalCell("B1", again.cells)).toBe("15");
  });
});

describe("cell refs", () => {
  it("col letters", () => {
    expect(colToLetters(0)).toBe("A");
    expect(colToLetters(25)).toBe("Z");
    expect(cellRef(0, 0)).toBe("A1");
  });
});

describe("evalCell", () => {
  it("arithmetic", () => {
    const cells = { A1: "2", B1: "3", C1: "=A1*B1+1", D1: "=(A1+B1)*2" };
    expect(evalCell("C1", cells)).toBe("7");
    expect(evalCell("D1", cells)).toBe("10");
  });

  it("cycle", () => {
    const cells = { A1: "=B1", B1: "=A1" };
    expect(evalCell("A1", cells)).toBe("#CYCLE");
  });

  it("div0", () => {
    expect(evalCell("A1", { A1: "=1/0" })).toBe("#DIV0");
  });
});
