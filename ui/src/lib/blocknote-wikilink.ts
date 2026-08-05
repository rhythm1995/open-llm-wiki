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
 * **递归**:真实笔记不是扁平段落。嵌套列表 / 任务列表的条目在父块的 `children` 里,
 * table 块的 content 是 `{type:"tableContent", rows:[{cells:[…]}]}` 对象(单元格才有
 * inline content)。两个方向都递归进 children 与表格单元格,否则这些位置的 `[[x]]`
 * 读入时不成 chip(不可点)、写回时 chip 残留(序列化出未知 inline)。
 * (真引擎探测确认形状见 probe 记录;codeBlock 也会嵌在 children 里,守卫随递归生效。)
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
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
 * 读入方向的 inline 变换:content 数组里 text(含字符串简写)的 `[[x]]` 升级成 chip。
 * 已是 wikilink / link / 其它类型的 inline 透传(幂等)。
 */
function hydrateInline(c: unknown[]): unknown[] {
  const next: unknown[] = [];
  for (const ic of c) {
    if (typeof ic === "string") {
      // 字符串简写元素(合成输入/容错):当 inline 文本拆,拆出 wikilink。真实 BlockNote
      // 产物里 content 元素恒为 {type:"text"} 对象(codeBlock 已在块级守卫跳过);能走到
      // 这里的字符串只可能来自接受 inline 的块,拆是安全的。
      next.push(...splitText(ic, {}));
    } else if (
      isRecord(ic) &&
      ic.type === "text" &&
      typeof ic.text === "string"
    ) {
      next.push(...splitText(ic.text, ic.styles));
    } else {
      next.push(ic); // wikilink / link / 其它 → 透传(幂等)
    }
  }
  return next;
}

/** 写回方向的 inline 变换:wikilink chip 还原为 text `[[inner]]`;其余透传。 */
function dehydrateInline(c: unknown[]): unknown[] {
  return c.flatMap((ic: unknown) => {
    if (
      isRecord(ic) &&
      ic.type === "wikilink" &&
      isRecord(ic.props) &&
      typeof (ic.props as { inner?: unknown }).inner === "string"
    ) {
      return [textInline(`[[${(ic.props as { inner: string }).inner}]]`, {})];
    }
    return [ic];
  });
}

/**
 * table 块的 content 不是 inline 数组,而是 `{type:"tableContent", rows:[{cells:[…]}]}`;
 * 单元格(tableCell)才有 inline content。逐单元格套用 mapInline,保证表格里的 `[[x]]`
 * 同样参与 round-trip。rows/cells 形状不合预期时原样透传(容错不抛)。
 */
function mapTableContent(
  content: Record<string, unknown>,
  mapInline: (arr: unknown[]) => unknown[],
): Record<string, unknown> {
  const rows = content.rows;
  if (!Array.isArray(rows)) return content;
  const nextRows = rows.map((row) => {
    if (!isRecord(row) || !Array.isArray(row.cells)) return row;
    const cells = (row.cells as unknown[]).map((cell) => {
      if (!isRecord(cell) || !Array.isArray(cell.content)) return cell;
      return { ...cell, content: mapInline(cell.content as unknown[]) };
    });
    return { ...row, cells };
  });
  return { ...content, rows: nextRows };
}

/**
 * 对单个块做递归变换:
 * - codeBlock 整体跳过(见下);
 * - inline 数组 content → mapInline;tableContent 对象 content → 逐单元格;
 * - `children`(嵌套列表 / 引用嵌套 / 列布局等)递归同法处理。
 */
function walkBlock(
  b: Record<string, unknown>,
  mapInline: (arr: unknown[]) => unknown[],
): Record<string, unknown> {
  // codeBlock 在 ProseMirror schema 里只接受纯 text,不接收自定义 wikilink chip。往里塞
  // chip 会让 createChecked 抛 "Invalid content for node codeBlock" → 整棵编辑器树崩 →
  // 白屏(实测:正文里贴了 ```yaml\n...[[x]]...``` 这类含 wikilink 的代码块即触发)。
  // 注意 BlockNote 的类型名是 **codeBlock**(非 "code")。codeBlock 也会作为 children
  // 出现(如列表内嵌代码块),故守卫放在递归入口,对任意深度生效。
  // 代码块里的 [[x]] 本就是字面文本,原样保留,不升级成 chip。
  if (b.type === "codeBlock") return b;
  const out: Record<string, unknown> = { ...b };
  if (Array.isArray(b.content)) {
    out.content = mapInline(b.content as unknown[]);
  } else if (isRecord(b.content) && b.content.type === "tableContent") {
    out.content = mapTableContent(b.content, mapInline);
  }
  if (Array.isArray(b.children)) {
    out.children = (b.children as Record<string, unknown>[]).map((cb) =>
      walkBlock(cb, mapInline),
    );
  }
  return out;
}

/**
 * 读入方向:递归遍历块树(顶层 + children + 表格单元格),把 text 里的 `[[x]]`
 * 升级成 wikilink chip。幂等;codeBlock 任意深度均整体跳过。
 */
export function hydrateWikilinks<T extends { content?: unknown }>(blocks: T[]): T[] {
  return (blocks as unknown as Record<string, unknown>[]).map((b) =>
    walkBlock(b, hydrateInline),
  ) as unknown as T[];
}

/**
 * 写回方向:递归把 wikilink chip 还原为 text `[[inner]]`,供 blocksToMarkdownLossy
 * 序列化。对全 text 输入幂等。
 */
export function dehydrateWikilinks<T extends { content?: unknown }>(blocks: T[]): T[] {
  return (blocks as unknown as Record<string, unknown>[]).map((b) =>
    walkBlock(b, dehydrateInline),
  ) as unknown as T[];
}
