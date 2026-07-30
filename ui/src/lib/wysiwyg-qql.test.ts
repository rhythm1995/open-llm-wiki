import { describe, expect, it } from "vitest";
import {
  collectWysiwygQqlJobs,
  resultSetToStatus,
} from "./wysiwyg-qql";

describe("collectWysiwygQqlJobs", () => {
  it("从 body 提取 qql 块(忽略 fm)", () => {
    const md = `---
type: Note
---
# T

\`\`\`qql
WHERE type = "Concept"
\`\`\`
`;
    const jobs = collectWysiwygQqlJobs(md);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].query).toContain("Concept");
  });

  it("无 qql → 空", () => {
    expect(collectWysiwygQqlJobs("# hi\n")).toEqual([]);
  });
});

describe("resultSetToStatus", () => {
  it("List → ok html", () => {
    const s = resultSetToStatus({ List: [1, 2] });
    expect(s.kind).toBe("ok");
    if (s.kind === "ok") expect(s.html.length).toBeGreaterThan(0);
  });
  it("error → error", () => {
    const s = resultSetToStatus({ error: "boom" });
    expect(s).toEqual({ kind: "error", message: "boom" });
  });
});
