// vitest 全局 setup:注入 jest-dom DOM 断言 + 处理 jsdom 与 RTL 的两处已知缺口。
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 未开 vitest globals,RTL 不会自动 cleanup —— 显式清理,避免测试间 DOM 累积导致
// getByText/getByRole 命中多个元素。
afterEach(() => {
  cleanup();
});

// jsdom 不实现布局方法(故意为之);TabBar 的 scrollIntoView、AgentPanel 的
// scrollTo(滚到底)等 effect 调用到时需要空实现。
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

// jsdom 无 ResizeObserver;图谱 / 部分面板挂载时测量容器。
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    private readonly cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element): void {
      this.cb(
        [
          {
            target,
            contentRect: target.getBoundingClientRect(),
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as ResizeObserverEntry,
        ],
        this,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
  };
}
