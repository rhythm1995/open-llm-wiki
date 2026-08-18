import { describe, expect, it, vi } from "vitest";
import { subscribeMenuAction } from "./menu-action";

describe("subscribeMenuAction", () => {
  it("listen 尚未 resolve 时 cleanup 仍会取消订阅", async () => {
    let resolveListen!: (unlisten: () => void) => void;
    const unlisten = vi.fn();
    const listen = vi.fn().mockImplementation(
      () =>
        new Promise<() => void>((resolve) => {
          resolveListen = resolve;
        }),
    );
    const dispatch = vi.fn();
    const current = { dispatch };
    const stop = subscribeMenuAction(listen, () => current.dispatch);

    stop();
    resolveListen(unlisten);
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("cleanup 之后的事件不再 dispatch", async () => {
    let handler: ((ev: { payload: string }) => void) | undefined;
    const listen = vi.fn().mockImplementation(
      (_event: string, h: (ev: { payload: string }) => void) => {
        handler = h;
        return Promise.resolve(() => {});
      },
    );
    const dispatch = vi.fn();
    const stop = subscribeMenuAction(listen, () => dispatch);
    await Promise.resolve();
    stop();
    handler?.({ payload: "report-issue" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("始终调用最新 dispatch,避免重复订阅", async () => {
    let handler: ((ev: { payload: string }) => void) | undefined;
    const listen = vi.fn().mockImplementation(
      (_event: string, h: (ev: { payload: string }) => void) => {
        handler = h;
        return Promise.resolve(() => {});
      },
    );
    const first = vi.fn();
    const second = vi.fn();
    const current = { dispatch: first };
    subscribeMenuAction(listen, () => current.dispatch);
    await Promise.resolve();
    current.dispatch = second;
    handler?.({ payload: "report-issue" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith("report-issue");
    expect(listen).toHaveBeenCalledTimes(1);
  });
});
