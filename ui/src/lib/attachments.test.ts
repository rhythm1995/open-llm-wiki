import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTACHMENTS_DIR,
  ensureImageExt,
  isImageFile,
  isVaultRelativeImageSrc,
  markdownImageSnippet,
  normalizeAttachmentsDir,
  normalizeEditorLayout,
  rewriteHtmlImageSrcs,
  sanitizeAttachmentBasename,
  uniqueAttachmentPath,
} from "./attachments";

describe("normalizeAttachmentsDir", () => {
  it("默认 attachments", () => {
    expect(normalizeAttachmentsDir("")).toBe(DEFAULT_ATTACHMENTS_DIR);
    expect(normalizeAttachmentsDir("../x")).toBe("x");
    expect(normalizeAttachmentsDir("/abs/foo")).toBe("abs/foo");
  });
});

describe("uniqueAttachmentPath", () => {
  it("冲突时加序号", () => {
    const taken = new Set(["attachments/1-a.png"]);
    const p = uniqueAttachmentPath(
      "attachments",
      "a.png",
      (r) => taken.has(r),
      1,
    );
    expect(p).toBe("attachments/1-1-a.png");
  });
});

describe("markdownImageSnippet", () => {
  it("标准 md 图", () => {
    expect(markdownImageSnippet("attachments/x.png", "pic")).toBe(
      "![pic](attachments/x.png)",
    );
  });
});

describe("rewriteHtmlImageSrcs", () => {
  it("只改写相对图", () => {
    const html =
      '<img src="attachments/a.png"><img src="https://x.com/a.png">';
    const out = rewriteHtmlImageSrcs(html, (s) => `asset://${s}`);
    expect(out).toContain('src="asset://attachments/a.png"');
    expect(out).toContain('src="https://x.com/a.png"');
  });
});

describe("isVaultRelativeImageSrc", () => {
  it("排除协议 URL", () => {
    expect(isVaultRelativeImageSrc("http://a/b.png")).toBe(false);
    expect(isVaultRelativeImageSrc("attachments/x.png")).toBe(true);
  });
});

describe("normalizeEditorLayout", () => {
  it("split / edit", () => {
    expect(normalizeEditorLayout("split")).toBe("split");
    expect(normalizeEditorLayout(null)).toBe("edit");
  });
});

describe("sanitizeAttachmentBasename", () => {
  it("去危险字符", () => {
    expect(sanitizeAttachmentBasename("../../x y.png")).toBe("x-y.png");
  });
});

describe("ensureImageExt", () => {
  it("按 mime 补扩展名", () => {
    expect(ensureImageExt("shot", "image/png")).toBe("shot.png");
  });
});

describe("isImageFile", () => {
  it("按 type / 扩展名识别", () => {
    expect(isImageFile({ type: "image/png", name: "x" } as File)).toBe(true);
    expect(isImageFile({ type: "", name: "a.webp" } as File)).toBe(true);
    expect(isImageFile({ type: "text/plain", name: "a.txt" } as File)).toBe(
      false,
    );
  });
});
