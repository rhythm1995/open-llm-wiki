/**
 * diag-log —— 把 webview 的运行时报错桥接到 Rust 进程的 stderr。
 *
 * 为什么需要:打包后(production webview)默认没有 inspector,app 从 Finder/Dock
 * 启动时,前端 `console.error` / 未捕获异常都**无声无息**地消失,导致"线上 bug
 * 看不到任何报错"。本模块在 Tauri 环境下安装全局捕获,经 `diag_log` 命令
 * (见 app/src-tauri/src/lib.rs)把每条错误 `eprintln!` 到 stderr —— 于是从命令行
 * 启动 app(`open …/OpenObsidian.app/Contents/MacOS/…` 或开发时 `tauri dev`)
 * 即可看到真实的 JS 报错与堆栈。
 *
 * 设计:fire-and-forget,转发本身再抛也不能影响业务;只桥 error/warn,不桥
 * log/info,避免噪声。浏览器(非 Tauri)环境下 no-op。
 */
import { invoke } from "@tauri-apps/api/core";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function fmt(a: unknown): string {
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

function send(line: string) {
  if (!isTauri) return;
  // 诊断桥自身绝不能再抛;失败静默。
  void invoke("diag_log", { line }).catch(() => {});
}

let installed = false;

/** 安装全局错误→stderr 转发。幂等;仅在 Tauri 生效。在 main.tsx 渲染前调用一次。 */
export function installConsoleForwarder(): void {
  if (!isTauri || installed) return;
  installed = true;

  window.addEventListener("error", (e) => {
    send(
      `error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}` +
        (e.error instanceof Error ? `\n${e.error.stack ?? ""}` : ""),
    );
  });
  window.addEventListener("unhandledrejection", (e) => {
    send(`unhandledrejection: ${fmt(e.reason)}`);
  });

  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origErr(...args);
    send("console.error: " + args.map(fmt).join(" "));
  };
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    send("console.warn: " + args.map(fmt).join(" "));
  };
}
