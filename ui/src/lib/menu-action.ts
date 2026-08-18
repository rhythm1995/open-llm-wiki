/**
 * 系统菜单 `menu-action` 订阅。
 * listen() 是异步的:cleanup 可能发生在 Promise resolve 之前,
 * 必须在 resolve 后立刻 unlisten,否则每次 dispatch 换身份都会泄漏一份订阅
 * (Help → Report Issue 会连开多个浏览器窗口)。
 */
export type MenuListen = (
  event: string,
  handler: (ev: { payload: string }) => void,
) => Promise<() => void>;

export function subscribeMenuAction(
  listen: MenuListen,
  getDispatch: () => (id: string) => void,
): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen("menu-action", (ev) => {
    if (disposed) return;
    getDispatch()(ev.payload);
  }).then((fn) => {
    if (disposed) {
      fn();
      return;
    }
    unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
