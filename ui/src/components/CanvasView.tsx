/**
 * CanvasView —— 中栏:tldraw 画布(F-CANVAS)。
 *
 * 持久化策略(文件即真相,与笔记同构):
 *   `.canvas` 文件 = tldraw `TLEditorSnapshot` 的 JSON(canvas.ts 负责 round-trip)。
 *   挂载时把文件内容 loadSnapshot 进 store;之后 store.listen({source:'user',
 *   scope:'document'}) 监听用户对文档的改动,防抖序列化为 JSON 回传 onSave,
 *   由 App 走与笔记同一条防抖落盘链路(setContent → writeNote)。所以画布与
 *   笔记共用保存/脏标志/状态栏,无需单独 IO 路径。
 *
 * 防回环:组件由 App 用 `key={path}` 挂载 —— 切换文件即重建,content 仅在挂载
 *   时读一次(loadSnapshot 先于 listen 注册,故初始载入不会触发保存回调)。
 *
 * 许可:tldraw 是 source-available 的非商用许可(见 THIRD_PARTY_NOTICES)。本组件
 *   静态 import tldraw,但 CanvasView 本身由 App 懒加载,故整个 tldraw bundle
 *   隔离在独立 chunk —— 不开画布就不下载。底部保留"Powered by tldraw"署名
 *   以满足其归属要求并明确许可边界。
 */
import { useEffect, useMemo, useRef } from "react";
import { Tldraw, createTLStore, getSnapshot, loadSnapshot } from "tldraw";
import type { TFunc } from "../lib/i18n";
import { parseCanvasContent, serializeCanvasContent } from "../lib/canvas";

import "tldraw/tldraw.css";

const SAVE_DEBOUNCE_MS = 400;

interface Props {
  /** 当前 `.canvas` 文件的原始内容(JSON,可能为空串)。 */
  content: string;
  /** 序列化后的画布快照回写(接入 store 的防抖落盘链路)。 */
  onSave: (next: string) => void;
  t: TFunc;
}

export function CanvasView({ content, onSave, t }: Props) {
  // 每个画布一个独立 store;组件由 App 按 path 作 key,故切换文件即新建 store。
  const store = useMemo(() => createTLStore(), []);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    // 1) 先载入已有快照(若有);空串/非法 → 保持空白画布。
    const snap = parseCanvasContent(content);
    if (snap) loadSnapshot(store, snap);

    // 2) 再注册监听:仅用户对 document 的改动才回写(排除载入/远端产生的噪音)。
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = store.listen(
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          saveRef.current(serializeCanvasContent(getSnapshot(store)));
        }, SAVE_DEBOUNCE_MS);
      },
      { source: "user", scope: "document" },
    );
    return () => {
      unsub();
      clearTimeout(timer);
    };
    // 仅在 store 生命周期挂载一次;content 的后续变更由 App 的 key 重建组件触发,
    // 而非在此副作用里重放(避免 载入→回写 的回环)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return (
    <div className="relative h-full w-full bg-base">
      <Tldraw store={store} />
      {/* 许可归属:tldraw 要求署名;同时向用户标明画布能力来自 tldraw。 */}
      <a
        href="https://tldraw.dev"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto absolute bottom-1 right-2 z-10 rounded bg-surface/70 px-1.5 py-0.5 text-[10px] text-overlay hover:text-subtext"
      >
        {t("canvas.poweredBy")}
      </a>
    </div>
  );
}
