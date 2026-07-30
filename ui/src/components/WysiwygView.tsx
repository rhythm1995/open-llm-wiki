/**
 * WysiwygView —— 中栏:BlockNote 块编辑器(md 的 WYSIWYG 模式)。
 *
 * 与 {@link Editor}(CodeMirror 源码模式)并列,两者读写**同一个** `state.content`
 * (.md 真相源)。对标 Tolaria 的 WYSIWYG/Raw 双模式:这里负责「所见即所得」,
 * Editor 负责「源码」,CM 模式同时也是任何 round-trip 漏洞的逃生舱。
 *
 * frontmatter 不进块编辑器(YAML 在 BlockNote 里无原生块、round-trip 会重排——
 * 是最大有损点)。本组件**只编辑 body**,frontmatter 走侧栏 Properties:
 *   读:`splitFrontmatter(content).body` → `tryParseMarkdownToBlocks` → `hydrateWikilinks`
 *   写:`dehydrateWikilinks` → `blocksToMarkdownLossy` → `mergeFrontmatter(最新 fm, body)` → onChange
 * fm 段永远跟随 `contentRef`(保留侧栏对 fm 的改动),body 段永远跟随编辑器,两者解耦。
 *
 * `[[wikilink]]` 体验闭环(对标 source 模式 Editor):
 *   - 呈现:hydrate 把 body 文本里的 `[[x]]` 升级成 wikilink chip(IC spec 见
 *     {@link WysiwygWikilink});chip 不可编辑、着色可点击。
 *   - 跳转:容器 onClick 代理读 `data-wikilink` → `onFollow(target)`(与 Editor / 侧栏
 *     共用上层 `handleFollow`)。
 *   - 补全:`SuggestionMenuController` 以 `[` 触发,在 `getItems` 里 gate(仅 `[[` 才给
 *     候选,单 `[` 的标准 md 链接静默),复用 wikilink.ts:filterByTitles。
 *   - 落盘:dehydrate 把 chip 还原为 text `[[inner]]`,落盘仍是纯文本字面量,与磁盘 /
 *     source 模式字节一致(alias/anchor 经 inner 完整保留)。
 *
 * 防回环(参考 {@link CanvasView}):切笔记由 App 用 `key={currentPath}` 重建本组件,
 * content 仅挂载时载入一次;onChange 防抖后比较「序列化出的 body 与 store 当前 body」,
 * 相同则不回写(初始载入、纯 fm 改动都不触发回写)。
 *
 * 许可:BlockNote MPL-2.0(见 THIRD_PARTY_NOTICES)。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { mergeFrontmatter, splitFrontmatter } from "../lib/frontmatter";
import { dehydrateWikilinks, hydrateWikilinks } from "../lib/blocknote-wikilink";
import { filterByTitles, parseLinkInner } from "../lib/wikilink";
import { wysiwygSchema } from "./WysiwygWikilink";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";
import { ipc } from "../lib/ipc";
import {
  collectWysiwygQqlJobs,
  resultSetToStatus,
  type WysiwygQqlStatus,
} from "../lib/wysiwyg-qql";
import { sanitize } from "../lib/render";

import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

const SAVE_DEBOUNCE_MS = 400;
const QQL_DEBOUNCE_MS = 450;

interface Props {
  /** 当前 `.md` 完整内容(含 frontmatter);真相源,与 Editor 共用。 */
  content: string;
  /** 合并后的完整内容回写(接入 store 的防抖落盘链路,与 Editor.onChange 同一条)。 */
  onChange: (next: string) => void;
  /** 点击 `[[target]]` chip 时触发;上层解析为路径后跳转(与 Editor 共用 handleFollow)。 */
  onFollow: (target: string) => void;
  /** vault 内全部笔记标题,用于 `[[` 自动补全。 */
  noteTitles: string[];
  /** 是否有当前笔记;无则显示空态。 */
  hasNote: boolean;
  /** 当前主题;传给 BlockNote 的 theme。 */
  theme: Theme;
  /** 本地化(仅空态文案用到)。 */
  t: TFunc;
  /** vault 根;用于 run_qql(与 source qql-widget 同路径)。 */
  root?: string | null;
}

export function WysiwygView({
  content,
  onChange,
  onFollow,
  noteTitles,
  hasNote,
  theme,
  t,
  root = null,
}: Props) {
  // 仅挂载时取一次 body;切笔记靠 App 的 key={currentPath} 重建触发,不在此响应 content 变化。
  const initialBody = useMemo(() => splitFrontmatter(content).body, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useCreateBlockNote({ schema: wysiwygSchema });

  // 最新 content ref:回写时取其 fm 段(保留侧栏 Properties 对 fm 的改动)。
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFollowRef = useRef(onFollow);
  onFollowRef.current = onFollow;
  const titlesRef = useRef(noteTitles);
  titlesRef.current = noteTitles;

  // 挂载:把 body 解析成块,wikilink 升级成 chip,替换掉 editor 的初始空段落。
  useEffect(() => {
    const blocks = hydrateWikilinks(editor.tryParseMarkdownToBlocks(initialBody));
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

  /** BlockNote 文档变化 → 同步更新最新 body(chip 先 dehydrate 回纯文本)→ 防抖合并回写。 */
  const handleChange = () => {
    latestBodyMdRef.current = editor.blocksToMarkdownLossy(
      dehydrateWikilinks(editor.document),
    );
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

  // 内联 ```qql:与 source 同走 ipc.run_qql;结果列在编辑器下方。
  const [qqlStatuses, setQqlStatuses] = useState<
    { preview: string; query: string; status: WysiwygQqlStatus }[]
  >([]);
  useEffect(() => {
    if (!hasNote || !root) {
      setQqlStatuses([]);
      return;
    }
    const jobs = collectWysiwygQqlJobs(content);
    if (jobs.length === 0) {
      setQqlStatuses([]);
      return;
    }
    setQqlStatuses(
      jobs.map((j) => ({
        preview: j.preview,
        query: j.query,
        status: { kind: "loading" as const },
      })),
    );
    const handle = window.setTimeout(() => {
      void Promise.all(
        jobs.map(async (j) => {
          try {
            const res = await ipc.runQql(root, j.query);
            return {
              preview: j.preview,
              query: j.query,
              status: resultSetToStatus(res),
            };
          } catch (err) {
            return {
              preview: j.preview,
              query: j.query,
              status: {
                kind: "error" as const,
                message: err instanceof Error ? err.message : String(err),
              },
            };
          }
        }),
      ).then(setQqlStatuses);
    }, QQL_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [content, root, hasNote]);

  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-overlay">
        <p>{t("empty.selectOrCreate")}</p>
      </div>
    );
  }

  return (
    // click 事件代理:点 wikilink chip → 读 data-wikilink → onFollow(target)。
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <div
        className="min-h-0 flex-1 overflow-auto"
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest("[data-wikilink]");
          if (!el) return;
          e.preventDefault();
          const inner = el.getAttribute("data-wikilink");
          if (inner !== null) onFollowRef.current(parseLinkInner(inner).target);
        }}
      >
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme={theme === "dark" ? "dark" : "light"}
        >
          <SuggestionMenuController
            triggerCharacter="[" // 单字符;第二个 [ 进入 query
            minQueryLength={1} // 至少打出 `[[` 才弹(单 [ 不弹)
            getItems={async (query) => {
              if (!query.startsWith("[")) return [];
              const typed = query.slice(1);
              return filterByTitles(titlesRef.current, typed)
                .slice(0, 20)
                .map((title) => ({
                  title,
                  onItemClick: () => {
                    editor.insertInlineContent([
                      { type: "wikilink" as const, props: { inner: title } },
                      " ",
                    ]);
                  },
                }));
            }}
          />
        </BlockNoteView>
      </div>
      {qqlStatuses.length > 0 && (
        <div
          data-testid="wysiwyg-qql-results"
          className="max-h-[40%] shrink-0 overflow-y-auto border-t border-crust bg-mantle px-3 py-2"
        >
          <div className="mb-1 text-[10px] uppercase tracking-wide text-overlay">
            {t("editor.wysiwyg.qqlResults")}
          </div>
          {qqlStatuses.map((row, i) => (
            <div
              key={i}
              className="mb-2 rounded border border-crust bg-base px-2 py-1.5 text-[12px]"
            >
              <div className="mb-1 truncate font-mono text-[11px] text-subtext">
                {row.preview || "(empty)"}
              </div>
              {row.status.kind === "loading" && (
                <p className="text-overlay">{t("list.loading")}</p>
              )}
              {row.status.kind === "error" && (
                <p className="text-red">⚠ {row.status.message}</p>
              )}
              {row.status.kind === "ok" && (
                <div
                  className="qql-result prose-sm text-text"
                  dangerouslySetInnerHTML={{
                    __html: sanitize(row.status.html),
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
