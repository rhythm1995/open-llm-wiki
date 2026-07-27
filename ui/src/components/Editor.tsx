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
import { useEffect, useRef } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { filterByTitles, openLinkContext, parseLinkInner } from "../lib/wikilink";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Cmd/Ctrl + 点击 `[[target]]` 时触发;上层解析为路径后跳转。 */
  onFollow: (target: string) => void;
  /** vault 内全部笔记标题,用于 `[[` 自动补全。 */
  noteTitles: string[];
  /** 是否有内容可编辑;无当前笔记时显示空态。 */
  hasNote: boolean;
}

const LINK_RE = /\[\[([^\]]+)\]\]/g;

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

export function Editor({ value, onChange, onFollow, noteTitles, hasNote }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
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
        lineNumbers(),
        history(),
        highlightActiveLine(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        EditorView.lineWrapping,
        linkDecorations,
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

  if (!hasNote) {
    return (
      <div className="flex h-full items-center justify-center text-overlay">
        <p className="text-[13px]">从左侧选择一篇笔记,或新建一篇开始。</p>
      </div>
    );
  }

  return <div ref={host} className="h-full overflow-auto" />;
}
