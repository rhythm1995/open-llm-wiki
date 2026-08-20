/**
 * diag-log —— webview 运行时错误 → LogBus(文件 + stderr)。
 *
 * 打包后无 inspector 时,错误写入 AppLog 目录(见 docs/12-client-logging.md)。
 * 浏览器(非 Tauri)环境下 no-op(仅保留 console)。
 */
import { log } from "./logger";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 把 console 参数压成一行,给 LogBus。Error 带 stack;循环引用走 String。 */
export function formatLogArg(a: unknown): string {
  if (a instanceof Error) {
    const stack = a.stack ? `\n${a.stack}` : "";
    return `${a.name}: ${a.message}${stack}`;
  }
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function sendError(line: string) {
  if (!isTauri) return;
  log.error("webview", line);
}

function sendWarn(line: string) {
  if (!isTauri) return;
  log.warn("webview", line);
}

let installed = false;

/** 安装全局错误→LogBus 转发。幂等;仅在 Tauri 生效。在 main.tsx 渲染前调用一次。 */
export function installConsoleForwarder(): void {
  if (!isTauri || installed) return;
  installed = true;

  log.info("webview", "console forwarder installed");

  window.addEventListener("error", (e) => {
    sendError(
      `error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}` +
        (e.error instanceof Error ? `\n${e.error.stack ?? ""}` : ""),
    );
  });
  window.addEventListener("unhandledrejection", (e) => {
    sendError(`unhandledrejection: ${formatLogArg(e.reason)}`);
  });

  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origErr(...args);
    sendError("console.error: " + args.map(formatLogArg).join(" "));
  };
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    sendWarn("console.warn: " + args.map(formatLogArg).join(" "));
  };
}
