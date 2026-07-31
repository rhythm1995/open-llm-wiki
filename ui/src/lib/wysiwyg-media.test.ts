import { describe, expect, it } from "vitest";
import { planImageInsert, planImagesInsert } from "./wysiwyg-media";

describe("planImageInsert", () => {
  it("生成 attachments 路径与 md", () => {
    const p = planImageInsert("shot.png", "image/png", "attachments", () => false, 99);
    expect(p.relPath).toBe("attachments/99-shot.png");
    expect(p.snippet).toBe("![shot](attachments/99-shot.png)");
  });

  it("冲突时加序号", () => {
    const taken = new Set(["attachments/1-a.png"]);
    const p = planImageInsert(
      "a.png",
      "image/png",
      "attachments",
      (r) => taken.has(r),
      1,
    );
    expect(p.relPath).toBe("attachments/1-1-a.png");
  });
});

describe("planImagesInsert", () => {
  it("多张不撞路径", () => {
    const plans = planImagesInsert(
      [
        { name: "a.png", type: "image/png" },
        { name: "a.png", type: "image/png" },
      ],
      "attachments",
      () => false,
      5,
    );
    expect(plans).toHaveLength(2);
    expect(plans[0].relPath).not.toBe(plans[1].relPath);
  });
});
