/**
 * Editor —— 中栏:CodeMirror 6 Markdown 编辑器。
 *
 * 关键的 React↔CM 集成点:
 * - 编辑器只挂载一次([] 依赖),避免每次切笔记都重建。
 * - 外部 value 变化(切笔记)时,仅当与当前 doc 不一致才 dispatch 替换,避免光标跳。
 * - onChange 经 updateListener 取最新 doc;用 ref 保持最新回调,防止闭包陈旧。
 *
 * F-WIKILINK 的"跳转":
 * - ViewPlugin 给 `[[...]]` 加 cm-wikilink 标记(蓝色下划线)。
 * - Cmd/Ctrl + 点击 `[[...]]` → 抽出 target → onFollow(target),由上层解析并跳转
 *   (解析逻辑在 wikilink.ts,纯函数已测)。
 *
 * 选 CodeMirror 6 而非 BlockNote 作为 MVP 编辑器:CM 对纯 Markdown 文件的
 * 原生 round-trip 最稳(无富文本↔md 转换损耗),体积更小。富文本所见即所得留待 v2。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorView,
  keymap,
  highlightActiveLine,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, Compartment, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
  setSearchQuery,
  SearchQuery,
  findNext,
  findPrevious,
} from "@codemirror/search";
import { filterByTitles, openLinkContext, parseLinkInner } from "../lib/wikilink";
import { ipc } from "../lib/ipc";
import { findQqlBlocks } from "../lib/qql-block";
import { qqlInlineExtension, qqlResultsField, setQqlResult } from "./qql-widget";
import type { Theme } from "../lib/theme";
import type { TFunc } from "../lib/i18n";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Cmd/Ctrl + 点击 `[[target]]` 时触发;上层解析为路径后跳转。 */
  onFollow: (target: string) => void;
  /** vault 内全部笔记标题,用于 `[[` 自动补全。 */
  noteTitles: string[];
  /** vault 根目录;内联 ```qql 块据此走 run_qql 求值(mock 下返回空,真机走 Rust core)。 */
  root: string | null;
  /** 是否有内容可编辑;无当前笔记时显示空态。 */
  hasNote: boolean;
  /** 当前主题;编辑器据此切换 oneDark / 浅色。 */
  theme: Theme;
  /** 本地化(仅空态文案用到)。 */
  t: TFunc;
}

const LINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * 主题用 Compartment 动态切换:深色挂 oneDark;浅色用贴合应用配色的浅底主题
 * (语法高亮仍走 defaultHighlightStyle,它在浅底上可读)。切换时只 reconfigure,
 * 不重建编辑器,光标/历史不丢。
 */
const themeCompartment = new Compartment();

const lightEditor: Extension = EditorView.theme({
  "&": { backgroundColor: "var(--color-base)", color: "var(--color-text)" },
  // 活动行浅底高亮(无线号 gutter;对齐 Tolaria 编辑器)。
  ".cm-activeLine": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
});

/**
 * 深色主题:oneDark 提供语法高亮配,但会硬设底色 #282c34,与应用 --color-base(#1e1e1e)
 * 不一致,编辑器与 tab bar/inspector 之间出现可见色缝。故在 oneDark 之上叠加一层 theme,
 * 把底/字色钉到应用令牌,消除色缝(高亮配仍由 oneDark 提供)。
 */
const darkEditor: Extension = [
  oneDark,
  EditorView.theme({
    "&": { backgroundColor: "var(--color-base)", color: "var(--color-text)" },
    ".cm-gutters": { backgroundColor: "transparent" },
  }),
];

function editorThemeFor(theme: Theme): Extension {
  return theme === "dark" ? darkEditor : lightEditor;
}

/** 扫描整篇 doc,给每个 `[[...]]` 区间挂 cm-wikilink 标记(按位置升序加入)。 */
function buildLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc.toString();
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    builder.add(from, to, Decoration.mark({ class: "cm-wikilink" }));
  }
  return builder.finish();
}

const linkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLinkDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildLinkDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * 标题/引用行的「半所见即所得」装饰:扫描可见视口,给 `^#{1,6}\s` 行挂 cm-md-h*,
 * 给 `^>` 行挂 cm-md-quote(CSS 据此放大/着色)。仅可见视口,避免对长文档全文扫描。
 * 只加 line 装饰(呈现),不改文本,故光标/选区/撤销栈无感。
 */
const markdownLineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkdownLineDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildMarkdownLineDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function buildMarkdownLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (let i = view.viewport.from; i < view.viewport.to; ) {
    const line = doc.lineAt(i);
    const h = line.text.match(/^(#{1,6})\s+\S/);
    if (h) {
      builder.add(line.from, line.from, Decoration.line({ class: `cm-md-h${h[1].length}` }));
    } else if (/^>\s?/.test(line.text)) {
      builder.add(line.from, line.from, Decoration.line({ class: "cm-md-quote" }));
    }
    if (line.to >= doc.length) break;
    i = line.to + 1;
  }
  return builder.finish();
}

/**
 * `[[` 自动补全源:光标处于未闭合 `[[` 内时,按已输入文本过滤 vault 标题。
 * 命中逻辑与过滤在 wikilink.ts(已测);这里只把结果交给 CM 的补全 UI。
 */
function makeWikilinkCompletions(
  titlesRef: React.MutableRefObject<string[]>,
): (ctx: CompletionContext) => CompletionResult | null {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.state.doc.sliceString(Math.max(0, ctx.pos - 200), ctx.pos);
    const c = openLinkContext(before);
    if (!c) return null;
    const options = filterByTitles(titlesRef.current, c.typed)
      .slice(0, 100)
      .map((label) => ({ label, type: "file" as const, apply: `${label}]]` }));
    return {
      from: ctx.pos - c.typed.length,
      to: ctx.pos,
      options,
      validFor: /^[^\]|#]*$/,
    };
  };
}

export interface EditorHandle {
  /** 把编辑器滚动到某行(1-based),尽量居中。供大纲面板点击跳转。 */
  scrollToLine: (line: number) => void;
  /**
   * 文档内查找:设置 SearchQuery(全文高亮全部匹配)+ 跳到下一/上一处。
   * @returns 是否命中至少一处。
   */
  find: (query: string, backward?: boolean) => boolean;
  /** 清除查找高亮(关 FindBar 时调用)。 */
  clearFind: () => void;
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { value, onChange, onFollow, noteTitles, root, hasNote, theme, t },
  ref,
) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine: (lineNo: number) => {
        const v = view.current;
        if (!v) return;
        const ln = Math.min(Math.max(1, lineNo), v.state.doc.lines);
        const line = v.state.doc.line(ln);
        v.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
      },
      find: (query: string, backward = false) => {
        const v = view.current;
        if (!v) return false;
        // 空串:清高亮。
        if (!query) {
          v.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" })),
          });
          return false;
        }
        // literal + 不区分大小写;SearchQuery 驱动 cm-searchMatch 全文高亮。
        const sq = new SearchQuery({
          search: query,
          caseSensitive: false,
          literal: true,
          wholeWord: false,
        });
        v.dispatch({ effects: setSearchQuery.of(sq) });
        // 跳到匹配并选中(findNext/Previous 会选中当前 match)。
        const hit = backward ? findPrevious(v) : findNext(v);
        // 若当前选区已在末尾导致 findNext 失败,从文档头再找一次。
        if (!hit && !backward) {
          v.dispatch({
            selection: { anchor: 0 },
            effects: setSearchQuery.of(sq),
          });
          return findNext(v);
        }
        if (!hit && backward) {
          const end = v.state.doc.length;
          v.dispatch({
            selection: { anchor: end },
            effects: setSearchQuery.of(sq),
          });
          return findPrevious(v);
        }
        return hit;
      },
      clearFind: () => {
        const v = view.current;
        if (!v) return;
        v.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: "" })),
        });
      },
    }),
    [],
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFollowRef = useRef(onFollow);
  onFollowRef.current = onFollow;
  const titlesRef = useRef(noteTitles);
  titlesRef.current = noteTitles;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      doc: value,
      extensions: [
        history(),
        highlightActiveLine(),
        // 查找高亮:SearchQuery 驱动 match 装饰。不弹 CM 自带面板(FindBar 自绘)。
        // ⌘F 由 App 全局拦截 → FindBar,故从 searchKeymap 去掉 Mod-f / Mod-g 冲突项。
        search({ top: false }),
        highlightSelectionMatches(),
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap.filter(
            (b) =>
              b.key !== "Mod-f" &&
              b.key !== "Mod-F" &&
              b.key !== "Mod-g" &&
              b.key !== "Shift-Mod-g" &&
              b.key !== "Mod-Alt-g",
          ),
        ]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        themeCompartment.of(editorThemeFor(theme)),
        EditorView.lineWrapping,
        linkDecorations,
        markdownLineDecorations,
        ...qqlInlineExtension,
        autocompletion({
          override: [makeWikilinkCompletions(titlesRef)],
          activateOnTyping: true,
        }),
        EditorView.domEventHandlers({
          click(e: MouseEvent) {
            if (!(e.metaKey || e.ctrlKey)) return false;
            const ed = view.current;
            if (!ed) return false;
            const pos = ed.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos == null) return false;
            const line = ed.state.doc.lineAt(pos);
            const col = pos - line.from;
            LINK_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = LINK_RE.exec(line.text)) !== null) {
              if (col >= m.index && col <= m.index + m[0].length) {
                onFollowRef.current(parseLinkInner(m[1]).target);
                return true;
              }
            }
            return false;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
      parent: host.current,
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题变化时动态切换编辑器主题(不重建编辑器)。
  useEffect(() => {
    view.current?.dispatch({
      effects: themeCompartment.reconfigure(editorThemeFor(theme)),
    });
  }, [theme]);

  // 切笔记 / 外部写入时同步 doc。
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (value !== v.state.doc.toString()) {
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
    }
  }, [value]);

  // 内联 ```qql 块求值:doc 变化后(防抖)对每个未缓存的 query 调 run_qql,
  // 结果经 setQqlResult 写入 StateField → widget 装饰自动刷新。mock 下返回空(见 deferred)。
  useEffect(() => {
    const v = view.current;
    if (!v || !root) return;
    const queries = Array.from(
      new Set(findQqlBlocks(value).map((b) => b.query).filter((q) => q.length > 0)),
    );
    if (queries.length === 0) return;
    const cached = v.state.field(qqlResultsField);
    const pending = queries.filter((q) => !cached.has(q));
    if (pending.length === 0) return;
    const handle = window.setTimeout(() => {
      for (const q of pending) {
        ipc.runQql(root, q)
          .then((res) => {
            view.current?.dispatch({
              effects: setQqlResult.of({ query: q, result: res }),
            });
          })
          .catch((err) => {
            view.current?.dispatch({
              effects: setQqlResult.of({
                query: q,
                result: { error: err?.message ?? String(err) },
              }),
            });
          });
      }
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, root]);

  // 编辑器宿主始终挂载:CodeMirror 视图在首次挂载时**一次性**创建(上方 [] effect,
  // 只跑一次)。若写成"无笔记时早退返回另一个不带 ref 的 div",首次渲染 host.current
  // 为 null,创建 effect 提前返回且永不再跑 → CM 永远不建 → 无法编辑。
  // 因此空态用覆盖层叠在宿主之上;宿主始终在,CM 始终建好,选笔记即可编辑。
  return (
    <div className="relative h-full">
      <div ref={host} className="h-full overflow-auto" />
      {!hasNote && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--color-base)] text-overlay">
          <p className="text-[13px]">{t("empty.selectOrCreate")}</p>
        </div>
      )}
    </div>
  );
});
