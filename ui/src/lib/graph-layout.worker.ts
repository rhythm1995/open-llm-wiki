/**
 * graph-layout.worker —— 在 Worker 线程跑 FR 力导向,主线程不卡。
 *
 * 协议(结构化可克隆,不用 Transferable 也能跑;positions 用 entries 数组):
 *   → { type:"layout", requestId, ids, springs, positions, newIds?, neighbors?, w, h, iterations?, pinned? }
 *   ← { type:"layout-done", requestId, positions: [id, {x,y}][] }
 *   ← { type:"layout-error", requestId, message }
 *
 * 与 graph-layout.ts 同源算法;Worker 内动态 import 同源模块(vite `?worker`)。
 */
import {
  relaxLayout,
  seedNodes,
  type Pt,
  type Spring,
} from "./graph-layout";

export interface LayoutWorkerRequest {
  type: "layout";
  requestId: number;
  ids: number[];
  springs: Spring[];
  /** 已有位置 entries。 */
  positions: [number, Pt][];
  /** 需要播种的新 id(可选;缺省则 ids 中无位置者自动播种)。 */
  newIds?: number[];
  neighbors?: [number, number[]][];
  w: number;
  h: number;
  iterations?: number;
  pinned?: number[];
  repulsion?: "auto" | "exact" | "barnes-hut";
  barnesHutTheta?: number;
}

export interface LayoutWorkerResponse {
  type: "layout-done";
  requestId: number;
  positions: [number, Pt][];
}

export interface LayoutWorkerError {
  type: "layout-error";
  requestId: number;
  message: string;
}

function handle(msg: LayoutWorkerRequest): LayoutWorkerResponse {
  const pos = new Map<number, Pt>(msg.positions);
  const neighbors = new Map<number, number[]>(msg.neighbors ?? []);
  const missing =
    msg.newIds ?? msg.ids.filter((id) => !pos.has(id));
  if (missing.length > 0) {
    seedNodes(missing, neighbors, pos, { w: msg.w, h: msg.h });
  }
  // 清掉不在 ids 里的陈旧点(主线程也会做;双保险)。
  const live = new Set(msg.ids);
  for (const id of [...pos.keys()]) {
    if (!live.has(id)) pos.delete(id);
  }
  const pinned = msg.pinned ? new Set(msg.pinned) : undefined;
  relaxLayout(msg.ids, msg.springs, pos, {
    w: msg.w,
    h: msg.h,
    iterations: msg.iterations,
    pinned,
    repulsion: msg.repulsion,
    barnesHutTheta: msg.barnesHutTheta,
  });
  return {
    type: "layout-done",
    requestId: msg.requestId,
    positions: [...pos.entries()],
  };
}

// Worker 全局:避免依赖 lib.webworker 与 DOM 类型冲突,用 self 窄断言。
const workerSelf = self as unknown as {
  onmessage: ((ev: MessageEvent<LayoutWorkerRequest>) => void) | null;
  postMessage: (msg: LayoutWorkerResponse | LayoutWorkerError) => void;
};

workerSelf.onmessage = (ev: MessageEvent<LayoutWorkerRequest>) => {
  const data = ev.data;
  if (!data || data.type !== "layout") return;
  try {
    workerSelf.postMessage(handle(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const resp: LayoutWorkerError = {
      type: "layout-error",
      requestId: data.requestId,
      message,
    };
    workerSelf.postMessage(resp);
  }
};
