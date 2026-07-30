/**
 * graph-layout-client —— 主线程侧:优先 Worker 布局,失败/不可用则同步回退。
 *
 * 单测 / Node / 无 Worker 环境走 sync;浏览器 / Tauri 走 Worker。
 */
import {
  relaxLayout,
  seedNodes,
  type Pt,
  type Spring,
} from "./graph-layout";
import type {
  LayoutWorkerError,
  LayoutWorkerRequest,
  LayoutWorkerResponse,
} from "./graph-layout.worker";

export interface LayoutJob {
  ids: number[];
  springs: Spring[];
  positions: Map<number, Pt>;
  neighbors: Map<number, number[]>;
  w: number;
  h: number;
  iterations?: number;
  pinned?: ReadonlySet<number>;
  repulsion?: "auto" | "exact" | "barnes-hut";
  barnesHutTheta?: number;
}

export interface LayoutClient {
  run(job: LayoutJob): Promise<Map<number, Pt>>;
  dispose(): void;
}

function runSync(job: LayoutJob): Map<number, Pt> {
  const pos = new Map(job.positions);
  const live = new Set(job.ids);
  for (const id of [...pos.keys()]) {
    if (!live.has(id)) pos.delete(id);
  }
  const missing = job.ids.filter((id) => !pos.has(id));
  if (missing.length > 0) {
    seedNodes(missing, job.neighbors, pos, { w: job.w, h: job.h });
  }
  relaxLayout(job.ids, job.springs, pos, {
    w: job.w,
    h: job.h,
    iterations: job.iterations,
    pinned: job.pinned,
    repulsion: job.repulsion,
    barnesHutTheta: job.barnesHutTheta,
  });
  return pos;
}

/**
 * 同步布局客户端(测试默认;或 n 很小想省 worker 往返时)。
 */
export function createSyncLayoutClient(): LayoutClient {
  return {
    run: async (job) => runSync(job),
    dispose: () => {},
  };
}

/**
 * Worker 布局客户端。构造失败时内部降级为 sync。
 * Vite:`new Worker(new URL('./graph-layout.worker.ts', import.meta.url), { type: 'module' })`
 */
export function createWorkerLayoutClient(): LayoutClient {
  let worker: Worker | null = null;
  let seq = 1;
  const pending = new Map<
    number,
    {
      resolve: (p: Map<number, Pt>) => void;
      reject: (e: Error) => void;
    }
  >();

  try {
    if (typeof Worker !== "undefined") {
      worker = new Worker(
        new URL("./graph-layout.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (
        ev: MessageEvent<LayoutWorkerResponse | LayoutWorkerError>,
      ) => {
        const data = ev.data;
        const slot = pending.get(data.requestId);
        if (!slot) return;
        pending.delete(data.requestId);
        if (data.type === "layout-done") {
          slot.resolve(new Map(data.positions));
        } else {
          slot.reject(new Error(data.message));
        }
      };
      worker.onerror = (e) => {
        for (const [, slot] of pending) {
          slot.reject(new Error(e.message || "layout worker error"));
        }
        pending.clear();
      };
    }
  } catch {
    worker = null;
  }

  return {
    async run(job) {
      if (!worker) return runSync(job);
      const requestId = seq++;
      const msg: LayoutWorkerRequest = {
        type: "layout",
        requestId,
        ids: job.ids,
        springs: job.springs,
        positions: [...job.positions.entries()],
        neighbors: [...job.neighbors.entries()],
        w: job.w,
        h: job.h,
        iterations: job.iterations,
        pinned: job.pinned ? [...job.pinned] : undefined,
        repulsion: job.repulsion,
        barnesHutTheta: job.barnesHutTheta,
      };
      return new Promise<Map<number, Pt>>((resolve, reject) => {
        pending.set(requestId, {
          resolve,
          reject: (err) => {
            // Worker 失败 → 同步回退,不把错误抛给 UI。
            try {
              resolve(runSync(job));
            } catch {
              reject(err);
            }
          },
        });
        try {
          worker!.postMessage(msg);
        } catch {
          pending.delete(requestId);
          resolve(runSync(job));
        }
      });
    },
    dispose() {
      for (const [, slot] of pending) {
        slot.reject(new Error("layout client disposed"));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
}

/**
 * 默认客户端:浏览器有 Worker 用 Worker,否则 sync。
 */
export function createDefaultLayoutClient(): LayoutClient {
  if (typeof Worker === "undefined") return createSyncLayoutClient();
  return createWorkerLayoutClient();
}
