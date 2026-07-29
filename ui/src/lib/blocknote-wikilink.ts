/**
 * blocknote-wikilink.ts —— BlockNote wikilink inline content 的 md round-trip 纯逻辑。
 *
 * BlockNote 0.52 自家 md 管线(markdownToHTML / cleanHTMLToMarkdown)无私有插桩 API,
 * 无法把 `[[x]]` 注册成词法规则——默认它被当成字面文本。为让 wysiwyg 模式里 `[[x]]`
 * 既可点击(见 {@link '../components/WysiwygWikilink'} 的 IC spec)、又与磁盘 / source
 * 模式字节一致,在应用层做两道互逆 transform:
 *
 *   读入(hydrate):tryParseMarkdownToBlocks 之后遍历 inline,把 text 里的 `[[x]]`
 *     拆成 `{type:"wikilink", props:{inner:"x"}}` chip。
 *   写回(dehydrate):blocksToMarkdownLossy 之前把 wikilink chip 反向替换回 text
 *     `[[inner]]`,落盘仍是纯文本 `[[x]]`——Editor(source 模式)与 .md 文件只认这个字面量。
 *
 * `inner` 存 `[[...]]` 之间**完整**内层(含 `|alias`、`#anchor`),显示 / 跳转时再用
 * wikilink.ts:parseLinkInner 取 target,故 alias/anchor 在 round-trip 中无损。
 *
 * 两个函数互逆且幂等(hydrate 对已 chip 透传;dehydrate 对全 text 不变),单测钉死边界
 * (连续多个、alias/anchor、已 chip 不二次处理、非数组 content 透传)。纯逻辑,无 React。
 */

/** wikilink inline content 的 props(与 WysiwygWikilink 的 propSchema 对齐)。 */
export interface WikilinkProps {
  /** `[[...]]` 内层完整文本(含 alias/anchor),md round-trip 无损的载体。 */
  inner: string;
}

/** 单行匹配 `[[...]]`;内层禁 `]` 与换行,避免贪心跨段。 */
const WIKILINK_RE = /\[\[([^\]\n]+)\]\]/g;

function textInline(text: string, styles: unknown) {
  return { type: "text" as const, text, styles: (styles as object) ?? {} };
}

function wikilinkInline(inner: string) {
  return { type: "wikilink" as const, props: { inner } as WikilinkProps, content: undefined };
}

/**
 * 把一段 text 按 `[[x]]` 拆成交替的 text / wikilink 序列;无匹配时原样返回单条 text。
 * `[[a]]` 整段 → 只剩 wikilink;`pre [[a]] post` → 三段;空串 → 空(丢弃无意义空文本)。
 */
function splitText(text: string, styles: unknown): unknown[] {
  const out: unknown[] = [];
  WIKILINK_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(text)) !== null) {
    if (m.index > last) out.push(textInline(text.slice(last, m.index), styles));
    out.push(wikilinkInline(m[1]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(textInline(text.slice(last), styles));
  return out;
}

/**
 * 读入方向:遍历块的 inline 数组,把 text(含字符串简写)里的 `[[x]]` 升级成 wikilink chip。
 * 已是 wikilink / link / 其它类型的 inline 透传(幂等);content 非数组的块不动。
 */
export function hydrateWikilinks<T extends { content?: unknown }>(blocks: T[]): T[] {
  return blocks.map((b) => {
    const c = (b as { content?: unknown }).content;
    if (!Array.isArray(c)) return b;
    const next: unknown[] = [];
    for (const ic of c) {
      if (typeof ic === "string") {
        next.push(...splitText(ic, {}));
      } else if (
        ic !== null &&
        typeof ic === "object" &&
        (ic as { type?: string }).type === "text" &&
        typeof (ic as { text?: string }).text === "string"
      ) {
        const text = (ic as { text: string }).text;
        const styles = (ic as { styles?: unknown }).styles;
        next.push(...splitText(text, styles));
      } else {
        next.push(ic); // wikilink / link / 其它 → 透传(幂等)
      }
    }
    return { ...b, content: next };
  });
}

/**
 * 写回方向:把 wikilink chip 还原为 text `[[inner]]`,供 blocksToMarkdownLossy 序列化。
 * 非 wikilink 的 inline 与非数组 content 的块透传;对全 text 输入幂等。
 */
export function dehydrateWikilinks<T extends { content?: unknown }>(blocks: T[]): T[] {
  return blocks.map((b) => {
    const c = (b as { content?: unknown }).content;
    if (!Array.isArray(c)) return b;
    const next = c.flatMap((ic: unknown) => {
      if (
        ic !== null &&
        typeof ic === "object" &&
        (ic as { type?: string }).type === "wikilink" &&
        (ic as { props?: { inner?: unknown } }).props?.inner != null
      ) {
        const inner = (ic as { props: { inner: string } }).props.inner;
        return [textInline(`[[${inner}]]`, {})];
      }
      return [ic];
    });
    return { ...b, content: next };
  });
}
