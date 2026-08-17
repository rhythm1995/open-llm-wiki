import { describe, expect, it } from "vitest";
import {
  activeTab,
  addSheet,
  cellRef,
  chartDataFromRange,
  colToLetters,
  createEmptySheet,
  evalCell,
  expandRange,
  isSheetPath,
  parseSheet,
  renderChartSvg,
  serializeSheet,
  setCell,
  setFreeze,
  sheetToHtmlTable,
  upsertChart,
} from "./sheet";
import {
  findSheetBlocks,
  parseSheetBlockBody,
  sheetBlockToHtml,
} from "./sheet-block";

describe("sheet paths / schema v2", () => {
  it("isSheetPath", () => {
    expect(isSheetPath("a.sheet")).toBe(true);
    expect(isSheetPath("a.md")).toBe(false);
  });

  it("v1 migrate + roundtrip", () => {
    const v1 = JSON.stringify({
      openLlmWikiSheet: 1,
      cells: { A1: "10", B1: "=A1+5" },
      rows: 10,
      cols: 5,
    });
    const doc = parseSheet(v1);
    expect(doc.sheets).toHaveLength(1);
    expect(evalCell("B1", doc)).toBe("15");
    const again = parseSheet(serializeSheet(doc));
    expect(again.sheets[0].cells.A1).toBe("10");
  });

  it("multi-sheet + cross-sheet ref", () => {
    let doc = createEmptySheet();
    doc = setCell(doc, "A1", "3");
    doc = addSheet(doc, "Data");
    doc = setCell(doc, "A1", "7");
    // on Data, reference Sheet1!A1
    doc = setCell(doc, "B1", "=Sheet1!A1+A1");
    expect(evalCell("B1", doc, new Set(), "Data")).toBe("10");
  });

  it("freeze + chart persist", () => {
    let doc = createEmptySheet();
    doc = setFreeze(doc, doc.activeSheetId, 1, 1);
    doc = upsertChart(doc, {
      id: "c1",
      type: "bar",
      title: "t",
      sheetId: doc.activeSheetId,
      range: "A1:B3",
    });
    const again = parseSheet(serializeSheet(doc));
    expect(activeTab(again).freezeRows).toBe(1);
    expect(again.charts).toHaveLength(1);
  });
});

describe("cell refs / range", () => {
  it("col letters + expandRange", () => {
    expect(colToLetters(0)).toBe("A");
    expect(cellRef(0, 0)).toBe("A1");
    expect(expandRange("A1:B2")).toEqual(["A1", "B1", "A2", "B2"]);
  });
});

describe("evalCell formulas", () => {
  it("arithmetic", () => {
    const cells = { A1: "2", B1: "3", C1: "=A1*B1+1", D1: "=(A1+B1)*2" };
    expect(evalCell("C1", cells)).toBe("7");
    expect(evalCell("D1", cells)).toBe("10");
  });

  it("SUM / AVERAGE", () => {
    const cells = {
      A1: "1",
      A2: "2",
      A3: "3",
      B1: "=SUM(A1:A3)",
      B2: "=AVERAGE(A1:A3)",
    };
    expect(evalCell("B1", cells)).toBe("6");
    expect(evalCell("B2", cells)).toBe("2");
  });

  it("cycle", () => {
    const cells = { A1: "=B1", B1: "=A1" };
    expect(evalCell("A1", cells)).toBe("#CYCLE");
  });

  it("div0", () => {
    expect(evalCell("A1", { A1: "=1/0" })).toBe("#DIV0");
  });
});

describe("charts", () => {
  it("chartData + svg", () => {
    let doc = createEmptySheet();
    doc = setCell(doc, "A1", "x");
    doc = setCell(doc, "B1", "1");
    doc = setCell(doc, "A2", "y");
    doc = setCell(doc, "B2", "3");
    const data = chartDataFromRange(doc, doc.activeSheetId, "A1:B2");
    expect(data.labels).toEqual(["x", "y"]);
    expect(data.series[0].values).toEqual([1, 3]);
    const svg = renderChartSvg(data, "bar");
    expect(svg).toContain("<svg");
  });
});

describe("html embed", () => {
  it("sheetToHtmlTable", () => {
    let doc = createEmptySheet();
    doc = setCell(doc, "A1", "hi");
    const html = sheetToHtmlTable(doc);
    expect(html).toContain("hi");
    expect(html).toContain("<table>");
  });
});

describe("sheet-block md", () => {
  it("find + inline", () => {
    const src = "before\n```sheet\nA1=5\nA2==A1*2\n```\nafter";
    const blocks = findSheetBlocks(src);
    expect(blocks).toHaveLength(1);
    const spec = parseSheetBlockBody(blocks[0].body);
    expect(spec.inlineCells.A1).toBe("5");
    const html = sheetBlockToHtml(spec, null);
    expect(html).toContain("10");
  });

  it("path spec", () => {
    const spec = parseSheetBlockBody("path: budgets/x.sheet\ntab: Sheet1\n");
    expect(spec.path).toBe("budgets/x.sheet");
    expect(spec.tab).toBe("Sheet1");
  });
});
