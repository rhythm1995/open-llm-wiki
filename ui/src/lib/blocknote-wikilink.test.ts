/**
 * blocknote-wikilink.test.ts —— hydrate/dehydrate 的互逆与幂等(F-WIKILINK 在 wysiwyg
 * 模式的 round-trip 保证)。边界:连续多个、alias/anchor 无损、已 chip 不二次处理、
 * 非数组 content 透传、跨块混合。
 */
import { describe, it, expect } from "vitest";
import { hydrateWikilinks, dehydrateWikilinks } from "./blocknote-wikilink";

describe("hydrateWikilinks", () => {
  it("把 text 里的 [[x]] 拆成 wikilink chip", () => {
    const [b] = hydrateWikilinks([
      { content: [{ type: "text", text: "见 [[Foo]]", styles: {} }] },
    ]);
    expect(b.content).toEqual([
      { type: "text", text: "见 ", styles: {} },
      { type: "wikilink", props: { inner: "Foo" }, content: undefined },
    ]);
  });

  it("inline 数组里的字符串简写元素也拆", () => {
    const [b] = hydrateWikilinks([{ content: ["见 [[Foo]]"] }]);
    expect(b.content).toEqual([
      { type: "text", text: "见 ", styles: {} },
      { type: "wikilink", props: { inner: "Foo" }, content: undefined },
    ]);
  });

  it("前后缀 + 多个 wikilink 交替", () => {
    const [b] = hydrateWikilinks([
      { content: [{ type: "text", text: "[[a]] and [[b]]", styles: {} }] },
    ]);
    expect(b.content).toEqual([
      { type: "wikilink", props: { inner: "a" }, content: undefined },
      { type: "text", text: " and ", styles: {} },
      { type: "wikilink", props: { inner: "b" }, content: undefined },
    ]);
  });

  it("inner 完整保留 alias/anchor(round-trip 无损的载体)", () => {
    const [b] = hydrateWikilinks([
      { content: [{ type: "text", text: "[[Foo|Bar#x]]", styles: {} }] },
    ]);
    expect(b.content).toEqual([
      { type: "wikilink", props: { inner: "Foo|Bar#x" }, content: undefined },
    ]);
  });

  it("整段就是 [[a]] 时只剩 chip(无空文本碎片)", () => {
    const [b] = hydrateWikilinks([{ content: [{ type: "text", text: "[[a]]", styles: {} }] }]);
    expect(b.content).toEqual([
      { type: "wikilink", props: { inner: "a" }, content: undefined },
    ]);
  });

  it("已是 wikilink chip 的透传(幂等)", () => {
    const blocks = [
      { content: [{ type: "wikilink", props: { inner: "a" }, content: undefined }] },
    ];
    expect(hydrateWikilinks(blocks)).toEqual(blocks);
  });

  it("无 wikilink 的 text 原样保留", () => {
    const [b] = hydrateWikilinks([{ content: [{ type: "text", text: "plain", styles: {} }] }]);
    expect(b.content).toEqual([{ type: "text", text: "plain", styles: {} }]);
  });

  it("非数组 content 的块透传", () => {
    expect(hydrateWikilinks([{ content: undefined }])).toEqual([{ content: undefined }]);
  });
});

describe("dehydrateWikilinks", () => {
  it("把 wikilink chip 还原为 text [[inner]]", () => {
    const [b] = dehydrateWikilinks([
      { content: [{ type: "wikilink", props: { inner: "Foo" }, content: undefined }] },
    ]);
    expect(b.content).toEqual([{ type: "text", text: "[[Foo]]", styles: {} }]);
  });

  it("inner 含 alias/anchor 时写回完整 [[...]]", () => {
    const [b] = dehydrateWikilinks([
      { content: [{ type: "wikilink", props: { inner: "Foo|Bar#x" }, content: undefined }] },
    ]);
    expect(b.content).toEqual([{ type: "text", text: "[[Foo|Bar#x]]", styles: {} }]);
  });

  it("幂等:全 text 输入不变", () => {
    const blocks = [{ content: [{ type: "text", text: "[[a]]", styles: {} }] }];
    expect(dehydrateWikilinks(blocks)).toEqual(blocks);
  });

  it("非数组 content 的块透传", () => {
    expect(dehydrateWikilinks([{ content: undefined }])).toEqual([{ content: undefined }]);
  });
});

describe("hydrate ∘ dehydrate round-trip", () => {
  /** 把每块的 inline 数组拼成纯文本(blocksToMarkdownLossy 会合并连续 text,故以文本等价为准)。 */
  const flatten = (blocks: Array<{ content?: unknown }>): string[] =>
    blocks.map((b) => {
      const c = b.content;
      if (!Array.isArray(c)) return "";
      return c
        .map((ic) =>
          typeof ic === "string" ? ic : ((ic as { text?: string }).text ?? ""),
        )
        .join("");
    });

  it("md [[a]] → hydrate → dehydrate → md [[a]](单 chip 结构等价)", () => {
    const md = [{ content: [{ type: "text", text: "[[a]]", styles: {} }] }];
    expect(dehydrateWikilinks(hydrateWikilinks(md))).toEqual(md);
  });

  it("多块、混合文本、alias/anchor round-trip(文本逐字等价,无 chip 残留)", () => {
    // hydrate 会把单条 text 按 [[x]] 拆成多段,dehydrate 还原为多条 text;inline 数组
    // 结构不再相等,但拼接文本逐字一致(落盘时 BlockNote 合并连续 text,md 字节等价)。
    const md = [
      { content: [{ type: "text", text: "pre [[a]] mid [[b]] post", styles: {} }] },
      { content: undefined },
      { content: [{ type: "text", text: "[[c|C#c]]", styles: {} }] },
    ];
    const back = dehydrateWikilinks(hydrateWikilinks(md));
    expect(flatten(back)).toEqual(flatten(md));
    // 全部还原为 text,不得残留 wikilink chip。
    const hasChip = back.some((b) => {
      const c = b.content;
      return (
        Array.isArray(c) &&
        c.some((ic) => (ic as { type?: string }).type === "wikilink")
      );
    });
    expect(hasChip).toBe(false);
  });
});
