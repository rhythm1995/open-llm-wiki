/**
 * CanvasView —— 中栏:Excalidraw 画布(F-CANVAS,MIT)。
 *
 * 持久化:`.canvas` = OpenLlmWikiCanvas JSON(`canvas.ts`)。挂载读 content;
 * Excalidraw onChange 防抖 → serialize → onSave → 与笔记同构落盘。
 * App 用 `key={path}` 挂载,避免 载入→回写 回环。
 *
 * 懒加载隔离大包(App React.lazy)。旧 tldraw 文件只读提示,不尝试迁移。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { TFunc } from "../lib/i18n";
import {
  canvasDocFromExcalidraw,
  parseCanvasContent,
  serializeCanvasContent,
} from "../lib/canvas";
import { useTheme } from "../lib/useTheme";

import "@excalidraw/excalidraw/index.css";

const SAVE_DEBOUNCE_MS = 400;

interface Props {
  content: string;
  onSave: (next: string) => void;
  t: TFunc;
  /** 本画布文件相对路径;卸载 flush 定向写回用。 */
  notePath?: string | null;
  /** vault 根;卸载 flush 定向写回用。 */
  root?: string | null;
  /** 带所有权的回写(store.writeScoped)。 */
  onFlush?: (path: string, root: string | null, next: string) => void;
}

interface SceneSnapshot {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export function CanvasView({
  content,
  onSave,
  t,
  notePath = null,
  root = null,
  onFlush,
}: Props) {
  const { theme } = useTheme();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;
  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const rootRef = useRef(root);
  rootRef.current = root;
  const contentRef = useRef(content);
  contentRef.current = content;
  /** 最近一次 onChange 的场景快照:卸载时防抖 timer 已清,尾编辑从这里取。 */
  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** 仅指针/键盘动过才落盘。Excalidraw 挂载就会 onChange(主题/滚动),不能当成编辑。 */
  const userTouchedRef = useRef(false);
  const markTouched = () => {
    userTouchedRef.current = true;
  };
  const [legacyCopied, setLegacyCopied] = useState(false);

  const parsed = useMemo(() => parseCanvasContent(content), [content]);
  const isLegacy = parsed === "legacy";

  const excalTheme = theme === "dark" ? ("dark" as const) : ("light" as const);

  const initialData = useMemo(() => {
    if (!parsed || parsed === "legacy") {
      return {
        elements: [] as never[],
        appState: { theme: excalTheme },
        files: {},
      };
    }
    return {
      elements: parsed.elements as never[],
      appState: {
        ...parsed.appState,
        theme: excalTheme,
      },
      files: parsed.files as never,
    };
  }, [parsed, excalTheme]);

  const serializeScene = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) =>
      serializeCanvasContent(canvasDocFromExcalidraw(elements, appState, files)),
    [],
  );

  const onChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      latestSceneRef.current = { elements, appState, files };
      if (!userTouchedRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const scene = latestSceneRef.current;
        if (!scene) return;
        const next = serializeScene(scene.elements, scene.appState, scene.files);
        if (next === contentRef.current) return;
        saveRef.current(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [serializeScene],
  );

  // 卸载:清防抖 timer,未落盘的尾编辑经带所有权的回写定向写回本文件。
  // 此前 timer 幸存于卸载之后,会把画布 JSON 写进当时激活的任何笔记(2026-08-15 修复)。
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      const scene = latestSceneRef.current;
      if (!scene || !userTouchedRef.current) return;
      const next = serializeScene(scene.elements, scene.appState, scene.files);
      if (next === contentRef.current) return; // 无实质变化,不写(防回环/无谓落盘)
      const flush = onFlushRef.current;
      if (flush && notePathRef.current) {
        flush(notePathRef.current, rootRef.current, next);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (isLegacy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-base p-6 text-center">
        <p className="max-w-md text-[13px] text-text">{t("canvas.legacyTitle")}</p>
        <p className="max-w-md text-[12px] text-subtext">{t("canvas.legacyHint")}</p>
        <button
          type="button"
          className="rounded bg-surface px-3 py-1.5 text-[12px] text-text hover:bg-surface2"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(content);
              setLegacyCopied(true);
              setTimeout(() => setLegacyCopied(false), 1500);
            } catch {
              // 剪贴板不可用时静默。
            }
          }}
        >
          {legacyCopied ? t("canvas.legacyCopied") : t("canvas.legacyCopy")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full bg-base [&_.excalidraw]:h-full"
      onPointerDown={markTouched}
      onKeyDown={markTouched}
    >
      <Excalidraw
        initialData={initialData}
        theme={excalTheme}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveAsImage: true,
          },
        }}
        onChange={(elements, appState, files) => {
          onChange(
            elements as unknown as readonly unknown[],
            appState as unknown as Record<string, unknown>,
            (files ?? {}) as Record<string, unknown>,
          );
        }}
      />
    </div>
  );
}
