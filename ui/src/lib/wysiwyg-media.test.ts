import { describe, expect, it } from "vitest";
import { formatAttachmentStamp } from "./attachments";
import {
  blockNoteUploadSrc,
  planImageInsert,
  planImagesInsert,
  planImagesInsertAsync,
  shouldResolveVaultMediaUrl,
} from "./wysiwyg-media";

const STAMP = new Date(2026, 0, 1, 0, 0, 0).getTime();
const PREFIX = formatAttachmentStamp(STAMP);

describe("planImageInsert", () => {
  it("默认 folder-note:按笔记分桶 + 可读 stamp", () => {
    const p = planImageInsert(
      "shot.png",
      "image/png",
      "attachments",
      () => false,
      STAMP,
      { layout: "folder-note", notePath: "wiki/Daily.md" },
    );
    expect(p.relPath).toBe(`attachments/Daily/${PREFIX}-shot.png`);
    expect(p.snippet).toBe(`![shot](attachments/Daily/${PREFIX}-shot.png)`);
  });

  it("folder 扁平 + 冲突序号", () => {
    const taken = new Set([`attachments/${PREFIX}-a.png`]);
    const p = planImageInsert(
      "a.png",
      "image/png",
      "attachments",
      (r) => taken.has(r),
      STAMP,
      { layout: "folder" },
    );
    expect(p.relPath).toBe(`attachments/${PREFIX}-1-a.png`);
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
      STAMP,
      { layout: "folder" },
    );
    expect(plans).toHaveLength(2);
    expect(plans[0].relPath).not.toBe(plans[1].relPath);
  });
});

describe("planImagesInsertAsync", () => {
  it("异步占用检查", async () => {
    const taken = new Set<string>();
    const plans = await planImagesInsertAsync(
      [
        { name: "a.png", type: "image/png" },
        { name: "a.png", type: "image/png" },
      ],
      {
        attachmentsDir: "attachments",
        layout: "folder",
        stamp: STAMP,
        exists: async (r) => taken.has(r),
      },
    );
    expect(plans).toHaveLength(2);
    expect(plans[0]!.relPath).not.toBe(plans[1]!.relPath);
    // 模拟落盘后占用
    taken.add(plans[0]!.relPath);
    taken.add(plans[1]!.relPath);
  });
});

describe("blockNote upload/resolve 契约", () => {
  it("upload src 是相对路径而非 data URL", () => {
    const p = planImageInsert(
      "x.png",
      "image/png",
      "attachments",
      () => false,
      STAMP,
      { layout: "folder" },
    );
    const src = blockNoteUploadSrc(p.relPath);
    expect(src).toBe(`attachments/${PREFIX}-x.png`);
    expect(src.startsWith("data:")).toBe(false);
    expect(shouldResolveVaultMediaUrl(src)).toBe(true);
  });

  it("协议 URL 不走 vault resolve", () => {
    expect(shouldResolveVaultMediaUrl("data:image/png;base64,aaa")).toBe(false);
    expect(shouldResolveVaultMediaUrl("https://example.com/a.png")).toBe(false);
    expect(shouldResolveVaultMediaUrl("blob:http://localhost/x")).toBe(false);
  });
});
