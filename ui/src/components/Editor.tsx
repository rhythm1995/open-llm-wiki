/**
 * Editor —— 中栏:CodeMirror 6 Markdown 编辑器。
 *
 * 关键的 React↔CM 集成点:
 * - 编辑器只挂载一次([] 依赖),避免每次切笔记都重建。
 * - 外部 value 变化(切笔记)时,仅当与当前 doc 不一致才 dispatch 替换,避免光标跳。
 * - onChange 经 updateListener 取最新 doc;用 ref 保持最新回调,防止闭包陈旧。
 *
 * 选 CodeMirror 6 而非 BlockNote 作为 MVP 编辑器:CM 对纯 Markdown 文件的
 * 原生 round-trip 最稳(无富文本↔md 转换损耗),体积更小。富文本所见即所得留待 v2。
 */
import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** 是否有内容可编辑;无当前笔记时显示空态。 */
  hasNote: boolean;
}

export function Editor({ value, onChange, hasNote }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        oneDark,
        EditorView.lineWrapping,
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
