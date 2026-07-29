/**
 * WysiwygView —— 中栏:BlockNote 块编辑器(md 的 WYSIWYG 模式)。
 *
 * 与 {@link Editor}(CodeMirror 源码模式)并列,两者读写**同一个** `state.content`
 * (.md 真相源)。对标 Tolaria 的 WYSIWYG/Raw 双模式:这里负责「所见即所得」,
 * Editor 负责「源码」,CM 模式同时也是任何 round-trip 漏洞的逃生舱。
 *
 * frontmatter 不进块编辑器(YAML 在 BlockNote 里无原生块、round-trip 会重排——
 * 是最大有损点)。本组件**只编辑 body**,frontmatter 走侧栏 Properties:
 *   读:`splitFrontmatter(content).body` → `editor.tryParseMarkdownToBlocks`
 *   写:`editor.blocksToMarkdownLossy` → `mergeFrontmatter(最新 fm, body)` → onChange
 * fm 段永远跟随 `contentRef`(保留侧栏对 fm 的改动),body 段永远跟随编辑器,两者解耦。
 *
 * 防回环(参考 {@link CanvasView}):切笔记由 App 用 `key={currentPath}` 重建本组件,
 * content 仅挂载时载入一次;onChange 防抖后比较「序列化出的 body 与 store 当前 body」,
 * 相同则不回写(初始载入、纯 fm 改动都不触发回写)。
 *
 * 许可:BlockNote MPL-2.0(见 THIRD_PARTY_NOTICES)。wikilink `[[x]]` 暂以纯文本透传
 * (md→blocks→md 对文本无损,故 wikilink round-trip 无损),自定义可点击 inline 块与
 * `[[` 补全留作后续增强(见 plan Phase 1 可选)。
 */
import { useEffect, useMemo, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { mergeFrontmatter, splitFrontmatter } from "../lib/frontmatter";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";

import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

const SAVE_DEBOUNCE_MS = 400;

interface Props {
  /** 当前 `.md` 完整内容(含 frontmatter);真相源,与 Editor 共用。 */
  content: string;
  /** 合并后的完整内容回写(接入 store 的防抖落盘链路,与 Editor.onChange 同一条)。 */
  onChange: (next: string) => void;
  /** 是否有当前笔记;无则显示空态。 */
  hasNote: boolean;
  /** 当前主题;传给 BlockNote 的 theme。 */
  theme: Theme;
  /** 本地化(仅空态文案用到)。 */
  t: TFunc;
}

export function WysiwygView({ content, onChange, hasNote, theme, t }: Props) {
  // 仅挂载时取一次 body;切笔记靠 App 的 key={currentPath} 重建触发,不在此响应 content 变化。
  const initialBody = useMemo(() => splitFrontmatter(content).body, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useCreateBlockNote();

  // 最新 content ref:回写时取其 fm 段(保留侧栏 Properties 对 fm 的改动)。
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 挂载:把 body 解析成块,替换掉 editor 的初始空段落。
  useEffect(() => {
    const blocks = editor.tryParseMarkdownToBlocks(initialBody);
    editor.replaceBlocks(editor.document, blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 最近一次序列化出的 body(每次 change 同步更新);卸载 flush 用它,避免依赖可能已销毁的 editor。
  const latestBodyMdRef = useRef<string>("");

  /** 把最近序列化的 body 与 store 当前 body 比较,不同才合并回写(防自写回环)。 */
  const flushSave = () => {
    const bodyMd = latestBodyMdRef.current;
    if (!bodyMd) return;
    const { hasFm, fm, body } = splitFrontmatter(contentRef.current);
    // 序列化 body 与 store 当前 body 一致 → 无变化(初始载入 / 仅 fm 改动),跳过,避免回环。
    if (bodyMd === body) return;
    onChangeRef.current(mergeFrontmatter(hasFm, fm, bodyMd));
  };

  /** BlockNote 文档变化 → 同步更新最新 body → 防抖合并回写。 */
  const handleChange = () => {
    latestBodyMdRef.current = editor.blocksToMarkdownLossy(editor.document);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  // 卸载:清防抖并立即 flush,避免切模式/切笔记时丢失未落盘的编辑(flushSave 经 ref 读最新值)。
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      flushSave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-overlay">
        <p>{t("empty.selectOrCreate")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-base">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={theme === "dark" ? "dark" : "light"}
      />
    </div>
  );
}
