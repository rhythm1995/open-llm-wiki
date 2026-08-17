/**
 * WysiwygView —— 中栏:BlockNote 块编辑器(md 的 WYSIWYG 模式)。
 *
 * 与 {@link Editor}(CodeMirror 源码模式)并列,两者读写**同一个** `state.content`
 * (.md 真相源)。WYSIWYG/源码双模式:这里负责「所见即所得」,
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
 * 图片(B-ED-WYSIWYG-IMG):`uploadFile` 落盘 `attachments/` 并返回相对路径;
 * `resolveFileUrl` 显示时转 webview URL。粘贴/拖入/工具条与 slash 同一真相源。
 *
 * 许可:BlockNote MPL-2.0(见 THIRD_PARTY_NOTICES)。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import {
  Image as ImageIcon,
  LinkSimple,
  ListBullets,
  Quotes,
  TextB,
  TextH,
  TextItalic,
} from "@phosphor-icons/react";
import { mergeFrontmatter, splitFrontmatter } from "../lib/frontmatter";
import { dehydrateWikilinks, hydrateWikilinks } from "../lib/blocknote-wikilink";
import { filterByTitles, parseLinkInner } from "../lib/wikilink";
import { wysiwygSchema } from "./WysiwygWikilink";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";
import { ipc } from "../lib/ipc";
import {
  blobToDataUrl,
  collectImageFiles,
  DEFAULT_ATTACHMENT_LAYOUT,
  DEFAULT_ATTACHMENTS_DIR,
  type AttachmentLayout,
} from "../lib/attachments";
import {
  blockNoteUploadSrc,
  planImageInsertAsync,
  planImagesInsertAsync,
  shouldResolveVaultMediaUrl,
} from "../lib/wysiwyg-media";
import {
  applyProgressiveSelectAll,
  isSelectAllHotkey,
} from "../lib/wysiwyg-select-all";
import { collectHeadingBlocks } from "../lib/outline";

import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

const SAVE_DEBOUNCE_MS = 400;

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
  /** vault 根;用于图片粘贴/拖入落盘 attachments/(与 source 同路径)。 */
  root?: string | null;
  /** 附件目录(默认 attachments)。 */
  attachmentsDir?: string;
  /** 附件布局策略(默认 folder-note)。 */
  attachmentLayout?: AttachmentLayout;
  /** 当前笔记相对路径;folder-note / note-folder 分桶用。 */
  notePath?: string | null;
  /**
   * 带所有权的回写(store.writeScoped):flush 时携带本视图自己的 path+root。
   * 切笔记后卸载 flush 迟到时,由 store 定向写回原路径而非污染共享 content 槽。
   */
  onFlush?: (path: string, root: string | null, next: string) => void;
}

export interface WysiwygHandle {
  /** 跳到大纲第 index 个标题块,光标放到块首并滚到视口中间。 */
  scrollToHeading: (index: number) => void;
}

export const WysiwygView = forwardRef<WysiwygHandle, Props>(function WysiwygView(
  {
    content,
    onChange,
    onFollow,
    noteTitles,
    hasNote,
    theme,
    t,
    root = null,
    attachmentsDir = DEFAULT_ATTACHMENTS_DIR,
    attachmentLayout = DEFAULT_ATTACHMENT_LAYOUT,
    notePath = null,
    onFlush,
  },
  ref,
) {
  // 仅挂载时取一次 body;切笔记靠 App 的 key={currentPath} 重建触发,不在此响应 content 变化。
  const initialBody = useMemo(() => splitFrontmatter(content).body, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 最新 content / vault 上下文 ref:uploadFile 闭包读 ref,避免无 vault 时写 base64。
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;
  const onFollowRef = useRef(onFollow);
  onFollowRef.current = onFollow;
  const titlesRef = useRef(noteTitles);
  titlesRef.current = noteTitles;
  const rootRef = useRef(root);
  rootRef.current = root;
  const dirRef = useRef(attachmentsDir);
  dirRef.current = attachmentsDir;
  const layoutRef = useRef(attachmentLayout);
  layoutRef.current = attachmentLayout;
  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * BlockNote 官方插图入口(slash / FilePanel / 部分粘贴):
   * 无 uploadFile 时 BN 会 warn 且不落盘,或依赖默认 base64。
   * 统一走 attachments 布局 + 相对路径 src(与源码模式一致)。
   */
  const editor = useCreateBlockNote({
    schema: wysiwygSchema,
    uploadFile: async (file: File) => {
      const vaultRoot = rootRef.current;
      if (!vaultRoot) {
        throw new Error("open a vault before inserting images");
      }
      try {
        const plan = await planImageInsertAsync(file.name || "image.png", file.type, {
          attachmentsDir: dirRef.current,
          layout: layoutRef.current,
          notePath: notePathRef.current,
          exists: (p) => ipc.attachmentExistsAsync(vaultRoot, p),
        });
        const dataUrl = await blobToDataUrl(file);
        await ipc.saveAttachment(vaultRoot, plan.relPath, dataUrl);
        return blockNoteUploadSrc(plan.relPath);
      } catch (e) {
        // 让 BlockNote 结束 loading,并记入客户端日志。
        const msg = e instanceof Error ? e.message : String(e);
        console.error("uploadFile failed:", msg);
        throw e;
      }
    },
    resolveFileUrl: async (url: string) => {
      if (!shouldResolveVaultMediaUrl(url)) return url;
      const vaultRoot = rootRef.current;
      if (!vaultRoot) return url;
      // data URL 回读:比 asset:// 更稳,避免空图;磁盘仍是相对路径文件。
      return ipc.resolveMediaUrlAsync(vaultRoot, url);
    },
  });

  /** 粘贴/拖入/选图 → 附件落盘 + 插入原生 image 块(非 md 再解析,避免坏块)。 */
  const insertImageFiles = useCallback(
    async (files: File[]) => {
      const vaultRoot = rootRef.current;
      if (!vaultRoot || files.length === 0) return;
      const plans = await planImagesInsertAsync(
        files.map((f) => ({ name: f.name, type: f.type })),
        {
          attachmentsDir: dirRef.current,
          layout: layoutRef.current,
          notePath: notePathRef.current,
          exists: (p) => ipc.attachmentExistsAsync(vaultRoot, p),
        },
      );
      for (let i = 0; i < files.length; i++) {
        try {
          const plan = plans[i]!;
          const dataUrl = await blobToDataUrl(files[i]!);
          await ipc.saveAttachment(vaultRoot, plan.relPath, dataUrl);
          const cursor = editor.getTextCursorPosition();
          // 直接插 image 块:url 为 vault 相对路径(落盘 md 干净)。
          markTouched();
          editor.insertBlocks(
            [
              {
                type: "image",
                props: {
                  url: blockNoteUploadSrc(plan.relPath),
                  name: plan.alt,
                  caption: "",
                  showPreview: true,
                },
              },
            ],
            cursor.block,
            "after",
          );
        } catch (e) {
          console.error("insertImageFiles failed:", e);
        }
      }
      handleChange();
    },
    // handleChange 稳定读 ref;editor 挂载后固定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // 挂载:把 body 解析成块,wikilink 升级成 chip,替换掉 editor 的初始空段落。
  useEffect(() => {
    const blocks = hydrateWikilinks(editor.tryParseMarkdownToBlocks(initialBody));
    editor.replaceBlocks(editor.document, blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 最近一次序列化出的 body(每次 change 同步更新);卸载 flush 用它,避免依赖可能已销毁的 editor。
  const latestBodyMdRef = useRef<string>("");
  /** 仅用户动过才落盘。挂载 replaceBlocks / 回读图片会触发 onChange,不能当成编辑。 */
  const userTouchedRef = useRef(false);
  const markTouched = () => {
    userTouchedRef.current = true;
  };

  /** 把最近序列化的 body 与 store 当前 body 比较,不同才合并回写(防自写回环)。 */
  const flushSave = () => {
    if (!userTouchedRef.current) return;
    const bodyMd = latestBodyMdRef.current;
    if (!bodyMd) return;
    const { hasFm, fm, body } = splitFrontmatter(contentRef.current);
    // 序列化 body 与 store 当前 body 一致 → 无变化(初始载入 / 仅 fm 改动),跳过,避免回环。
    if (bodyMd === body) return;
    const next = mergeFrontmatter(hasFm, fm, bodyMd);
    // 优先走带所有权的回写:切笔记后卸载 flush 迟到时定向写回本笔记路径,
    // 不污染共享 content 槽(旧内容会落盘到新笔记路径,2026-08-15 竞态修复)。
    const flush = onFlushRef.current;
    if (flush && notePathRef.current) {
      flush(notePathRef.current, rootRef.current, next);
    } else {
      onChangeRef.current(next);
    }
  };

  /** BlockNote 文档变化 → 同步更新最新 body(chip 先 dehydrate 回纯文本)→ 防抖合并回写。 */
  const handleChange = () => {
    if (!userTouchedRef.current) return;
    latestBodyMdRef.current = editor.blocksToMarkdownLossy(
      dehydrateWikilinks(editor.document),
    );
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };
  /** 格式条 / 插图:点了就是用户编辑。 */
  const handleUserChange = () => {
    markTouched();
    handleChange();
  };

  // 卸载:清防抖并立即 flush,避免切模式/切笔记时丢失未落盘的编辑(flushSave 经 ref 读最新值)。
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      flushSave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // ⌘/Ctrl+A:先选中当前块(标题/段落)全文,再扩到整篇。
  // capture 抢在 TipTap 默认 AllSelection 之前;否则 heading 上常出现「看起来没全选」。
  const rootElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootElRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isSelectAllHotkey(e)) return;
      // 仅当焦点在本编辑器内(避免抢格式条外的其它 input)。
      const active = document.activeElement;
      if (!active || !el.contains(active)) return;
      // 不拦截真正的 <input>/<textarea>(若未来工具条有)。
      const tag = (active as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      e.stopPropagation();
      try {
        applyProgressiveSelectAll(
          editor as unknown as Parameters<typeof applyProgressiveSelectAll>[0],
        );
      } catch {
        /* 无选区 / 编辑器未就绪时忽略 */
      }
    };
    el.addEventListener("keydown", onKey, true);
    const markIfEdit = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete") {
          markTouched();
        }
        return;
      }
      markTouched();
    };
    el.addEventListener("keydown", markIfEdit);
    el.addEventListener("beforeinput", markIfEdit);
    el.addEventListener("paste", markIfEdit);
    el.addEventListener("drop", markIfEdit);
    el.addEventListener("dragend", markIfEdit);
    return () => {
      el.removeEventListener("keydown", onKey, true);
      el.removeEventListener("keydown", markIfEdit);
      el.removeEventListener("beforeinput", markIfEdit);
      el.removeEventListener("paste", markIfEdit);
      el.removeEventListener("drop", markIfEdit);
      el.removeEventListener("dragend", markIfEdit);
    };
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToHeading: (index: number) => {
        const headings = collectHeadingBlocks(
          editor.document as Array<{
            id: string;
            type: string;
            children?: Array<{ id: string; type: string }>;
          }>,
        );
        const block = headings[index];
        if (!block) return;
        try {
          editor.setTextCursorPosition(block.id, "start");
          editor.focus();
        } catch {
          /* 无块 / 未就绪 */
        }
        const root = editor.domElement ?? rootElRef.current;
        const el = root?.querySelector(
          `[data-id="${CSS.escape(block.id)}"]`,
        );
        el?.scrollIntoView({ block: "center" });
      },
    }),
    [editor],
  );

  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-overlay">
        <p>{t("empty.selectOrCreate")}</p>
      </div>
    );
  }

  return (
    // click 事件代理:点 wikilink chip → 读 data-wikilink → onFollow(target)。
    <div
      ref={rootElRef}
      className="flex h-full flex-col overflow-hidden bg-base"
      data-testid="wysiwyg-editor"
      onPaste={(e) => {
        const images = collectImageFiles(e.clipboardData);
        if (images.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        void insertImageFiles(images);
      }}
      onDragOver={(e) => {
        if (collectImageFiles(e.dataTransfer).length > 0) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const images = collectImageFiles(e.dataTransfer);
        if (images.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        void insertImageFiles(images);
      }}
    >
      <div
        data-testid="wysiwyg-fmt-bar"
        className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-crust bg-mantle px-1.5 py-0.5"
      >
        {(() => {
          const btn =
            "rounded p-1 text-overlay hover:bg-surface hover:text-text";
          const setBlockType = (
            type: string,
            props?: Record<string, unknown>,
          ) => {
            try {
              const { block } = editor.getTextCursorPosition();
              editor.updateBlock(block, {
                type: type as "paragraph",
                props: props as never,
              });
              handleUserChange();
            } catch {
              /* 无选区时忽略 */
            }
          };
          return (
            <>
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.bold")}
                data-testid="wysiwyg-fmt-bold"
                onClick={() => {
                  editor.toggleStyles({ bold: true });
                  handleUserChange();
                }}
              >
                <TextB size={14} weight="bold" />
              </button>
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.italic")}
                data-testid="wysiwyg-fmt-italic"
                onClick={() => {
                  editor.toggleStyles({ italic: true });
                  handleUserChange();
                }}
              >
                <TextItalic size={14} />
              </button>
              <span className="mx-0.5 h-3 w-px bg-crust" />
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.h1")}
                data-testid="wysiwyg-fmt-h1"
                onClick={() => setBlockType("heading", { level: 1 })}
              >
                <TextH size={14} />
                <span className="ml-0.5 text-[10px]">1</span>
              </button>
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.h2")}
                onClick={() => setBlockType("heading", { level: 2 })}
              >
                <TextH size={14} />
                <span className="ml-0.5 text-[10px]">2</span>
              </button>
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.h3")}
                onClick={() => setBlockType("heading", { level: 3 })}
              >
                <TextH size={14} />
                <span className="ml-0.5 text-[10px]">3</span>
              </button>
              <span className="mx-0.5 h-3 w-px bg-crust" />
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.bullet")}
                data-testid="wysiwyg-fmt-bullet"
                onClick={() => setBlockType("bulletListItem")}
              >
                <ListBullets size={14} />
              </button>
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.quote")}
                data-testid="wysiwyg-fmt-quote"
                onClick={() => {
                  try {
                    const { block } = editor.getTextCursorPosition();
                    const t0 = (block as { type?: string }).type;
                    setBlockType(t0 === "quote" ? "paragraph" : "quote");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <Quotes size={14} />
              </button>
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.wikilink")}
                data-testid="wysiwyg-fmt-wikilink"
                onClick={() => {
                  try {
                    editor.insertInlineContent([
                      {
                        type: "wikilink",
                        props: { inner: "Note" },
                      } as never,
                    ]);
                    handleUserChange();
                  } catch {
                    editor.insertInlineContent([
                      { type: "text", text: "[[Note]]", styles: {} },
                    ]);
                    handleUserChange();
                  }
                }}
              >
                <LinkSimple size={14} />
              </button>
              <span className="mx-0.5 h-3 w-px bg-crust" />
              <button
                type="button"
                className={btn}
                title={t("editor.fmt.image")}
                data-testid="wysiwyg-insert-image"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                data-testid="wysiwyg-image-input"
                onChange={(e) => {
                  const list = e.target.files;
                  if (list && list.length > 0) {
                    void insertImageFiles(Array.from(list));
                  }
                  e.target.value = "";
                }}
              />
            </>
          );
        })()}
      </div>
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
    </div>
  );
});
