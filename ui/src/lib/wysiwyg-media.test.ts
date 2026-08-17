import { describe, expect, it } from "vitest";
import { formatAttachmentStamp } from "./attachments";
import {
  blockNoteUploadSrc,
  planImageInsertAsync,
  planImagesInsertAsync,
  shouldResolveVaultMediaUrl,
} from "./wysiwyg-media";

const STAMP = new Date(2026, 0, 1, 0, 0, 0).getTime();
const PREFIX = formatAttachmentStamp(STAMP);

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
  it("upload src 是相对路径而非 data URL", async () => {
    const p = await planImageInsertAsync("x.png", "image/png", {
      attachmentsDir: "attachments",
      layout: "folder",
      stamp: STAMP,
      exists: async () => false,
    });
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
