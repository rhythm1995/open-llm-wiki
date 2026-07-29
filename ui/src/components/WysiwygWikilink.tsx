/**
 * WysiwygWikilink —— BlockNote 的 `[[wikilink]]` 自定义 inline content(spec + schema)。
 *
 * 把正文里的 `[[target]]` 渲染成可点击的着色 chip(对标 source 模式 Editor 的 cm-wikilink
 * 装饰 + 点击跳转)。点击不在 chip 内处理——chip 上的点击事件由 {@link WysiwygView} 的
 * 容器事件代理捕获(读 `data-wikilink`),本 spec 只负责呈现。
 *
 * md round-trip 不走 BlockNote 自家管线(0.52 无私有插桩 API,`[[x]]` 默认当字面文本):
 * WysiwygView 在 tryParseMarkdownToBlocks 后 {@link hydrateWikilinks}、blocksToMarkdownLossy
 * 前 {@link dehydrateWikilinks}(见 lib/blocknote-wikilink.ts)。本 spec 只管 chip 的可视
 * 与外部 HTML 形态。
 *
 * schema 在**模块级**构造一次(热重载 / 重渲染不重建 editor);inlineContentSpecs 合并
 * defaultInlineContentSpecs(保留 text/link)再加 wikilink。
 */
import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactInlineContentSpec } from "@blocknote/react";
import { parseLinkInner } from "../lib/wikilink";

export const WikilinkSpec = createReactInlineContentSpec(
  {
    type: "wikilink",
    content: "none", // 原子 chip,内部不可编辑
    propSchema: {
      /** `[[...]]` 内层完整文本(含 alias/anchor);显示/跳转时取 target。 */
      inner: { default: "" },
    },
  } as const,
  {
    render: ({ inlineContent }) => {
      const target = parseLinkInner(inlineContent.props.inner).target;
      return (
        <span
          data-wikilink={inlineContent.props.inner}
          contentEditable={false}
          className="cursor-pointer rounded-sm bg-blue/10 px-0.5 text-blue underline decoration-blue/40 underline-offset-2 hover:bg-blue/20"
          title={target}
        >
          [[{target}]]
        </span>
      );
    },
  },
);

/** WysiwygView 用的 schema:默认 text/link + wikilink。模块级单例,避免重建 editor。 */
export const wysiwygSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    wikilink: WikilinkSpec,
  },
});
