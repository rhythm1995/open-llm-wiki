/**
 * CanvasView —— 中栏:Excalidraw 画布(F-CANVAS,MIT)。
 *
 * 持久化:`.canvas` = OpenLlmWikiCanvas JSON(`canvas.ts`)。挂载读 content;
 * Excalidraw onChange 防抖 → serialize → onSave → 与笔记同构落盘。
 * App 用 `key={path}` 挂载,避免 载入→回写 回环。
 *
 * 懒加载隔离大包(App React.lazy)。旧 tldraw 文件只读提示,不尝试迁移。
 */
import { useCallback, useMemo, useRef, useState } from "react";
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
}

export function CanvasView({ content, onSave, t }: Props) {
  const { theme } = useTheme();
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  const onChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const doc = canvasDocFromExcalidraw(elements, appState, files);
        saveRef.current(serializeCanvasContent(doc));
      }, SAVE_DEBOUNCE_MS);
    },
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
    <div className="relative h-full w-full bg-base [&_.excalidraw]:h-full">
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
