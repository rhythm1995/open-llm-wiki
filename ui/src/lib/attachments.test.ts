import { describe, expect, it } from "vitest";
import {
  allocateAttachmentPath,
  attachmentTargetDir,
  buildMediaRefIndex,
  DEFAULT_ATTACHMENTS_DIR,
  ensureImageExt,
  extractMarkdownImagePaths,
  findOrphanAttachments,
  formatAttachmentStamp,
  isImageFile,
  isVaultRelativeImageSrc,
  markdownImageSnippet,
  noteDirFromPath,
  noteStemFromPath,
  normalizeAttachmentLayout,
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

describe("normalizeAttachmentLayout", () => {
  it("合法值 / 默认 folder-note", () => {
    expect(normalizeAttachmentLayout("folder")).toBe("folder");
    expect(normalizeAttachmentLayout("folder-date")).toBe("folder-date");
    expect(normalizeAttachmentLayout("folder-note")).toBe("folder-note");
    expect(normalizeAttachmentLayout("note-folder")).toBe("note-folder");
    expect(normalizeAttachmentLayout("nope")).toBe("folder-note");
    expect(normalizeAttachmentLayout(null)).toBe("folder-note");
  });
});

describe("formatAttachmentStamp / note paths", () => {
  it("格式化为 YYYYMMDD-HHmmss", () => {
    // 固定本地时刻:构造 Date 各分量
    const d = new Date(2026, 7, 2, 15, 4, 5); // month 0-based → Aug
    const s = formatAttachmentStamp(d.getTime());
    expect(s).toMatch(/^20260802-150405$/);
  });

  it("noteStem / noteDir", () => {
    expect(noteStemFromPath("docs/My Note.md")).toBe("My-Note");
    expect(noteDirFromPath("docs/sub/a.md")).toBe("docs/sub");
    expect(noteDirFromPath("root.md")).toBe("");
  });
});

describe("attachmentTargetDir", () => {
  it("folder / date / note / note-folder", () => {
    const stamp = new Date(2026, 7, 2, 12, 0, 0).getTime();
    expect(attachmentTargetDir("attachments", "folder")).toBe("attachments");
    expect(attachmentTargetDir("attachments", "folder-date", null, stamp)).toBe(
      "attachments/2026-08-02",
    );
    expect(
      attachmentTargetDir("attachments", "folder-note", "wiki/Zettel.md"),
    ).toBe("attachments/Zettel");
    expect(
      attachmentTargetDir("attachments", "note-folder", "wiki/Zettel.md"),
    ).toBe("wiki");
    expect(attachmentTargetDir("attachments", "note-folder", "alone.md")).toBe(
      "",
    );
  });
});

describe("uniqueAttachmentPath", () => {
  it("冲突时加序号 + 可读 stamp", () => {
    const stamp = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const prefix = formatAttachmentStamp(stamp);
    const taken = new Set([`attachments/${prefix}-a.png`]);
    const p = uniqueAttachmentPath(
      "attachments",
      "a.png",
      (r) => taken.has(r),
      stamp,
      { layout: "folder" },
    );
    expect(p).toBe(`attachments/${prefix}-1-a.png`);
  });

  it("folder-note 按笔记分桶", () => {
    const stamp = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const prefix = formatAttachmentStamp(stamp);
    const p = uniqueAttachmentPath(
      "attachments",
      "shot.png",
      () => false,
      stamp,
      { layout: "folder-note", notePath: "notes/Daily.md" },
    );
    expect(p).toBe(`attachments/Daily/${prefix}-shot.png`);
  });
});

describe("allocateAttachmentPath", () => {
  it("异步 exists", async () => {
    const stamp = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const prefix = formatAttachmentStamp(stamp);
    const taken = new Set([`attachments/${prefix}-a.png`]);
    const p = await allocateAttachmentPath(
      "attachments",
      "a.png",
      async (r) => taken.has(r),
      stamp,
      { layout: "folder" },
    );
    expect(p).toBe(`attachments/${prefix}-1-a.png`);
  });
});

describe("extractMarkdownImagePaths / media index / orphans", () => {
  it("抽出相对图、忽略外链", () => {
    const md = `
![a](attachments/a.png)
![b](https://x.com/b.png)
![](./media/c.webp "t")
`;
    expect(extractMarkdownImagePaths(md)).toEqual([
      "attachments/a.png",
      "media/c.webp",
    ]);
  });

  it("反向索引 + 孤儿", () => {
    const index = buildMediaRefIndex([
      {
        path: "a.md",
        body: "![x](attachments/Daily/x.png)",
      },
      {
        path: "b.md",
        body: "also ![x](attachments/Daily/x.png) and ![y](attachments/y.png)",
      },
    ]);
    expect(index.get("attachments/Daily/x.png")).toEqual(["a.md", "b.md"]);
    expect(index.get("attachments/y.png")).toEqual(["b.md"]);
    const orphans = findOrphanAttachments(
      [
        "attachments/Daily/x.png",
        "attachments/y.png",
        "attachments/orphan.png",
      ],
      index,
    );
    expect(orphans).toEqual(["attachments/orphan.png"]);
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
  it("去危险字符、保留中文", () => {
    expect(sanitizeAttachmentBasename("../../x y.png")).toBe("x-y.png");
    expect(sanitizeAttachmentBasename("我的笔记.md")).toBe("我的笔记.md");
    expect(sanitizeAttachmentBasename('a<>b|"c.png')).toBe("a_b_c.png");
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
