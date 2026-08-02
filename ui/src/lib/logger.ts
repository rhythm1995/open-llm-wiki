/**
 * logger —— 前端结构化日志(L1)。
 *
 * Tauri: invoke `log_write` → Rust LogBus(文件 NDJSON + stderr)。
 * 浏览器 mock: console 镜像,不写盘。
 *
 * 见 docs/12-client-logging.md。
 */
import { invoke } from "@tauri-apps/api/core";

export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

export type LogProfile = "dev" | "verbose" | "prod";

export interface LogStatus {
  dir: string;
  profile: string;
  sessionId: string;
}

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function send(
  level: LogLevel,
  target: string,
  msg: string,
  fields?: Record<string, unknown>,
): void {
  if (!isTauri) {
    const line = `[${level}] ${target}: ${msg}`;
    if (level === "error" || level === "fatal") console.error(line, fields ?? "");
    else if (level === "warn") console.warn(line, fields ?? "");
    else if (typeof console.debug === "function" && (level === "debug" || level === "trace"))
      console.debug(line, fields ?? "");
    else console.info(line, fields ?? "");
    return;
  }
  void invoke("log_write", {
    level,
    target,
    msg,
    fields: fields ?? null,
  }).catch(() => {});
}

export const log = {
  trace: (target: string, msg: string, fields?: Record<string, unknown>) =>
    send("trace", target, msg, fields),
  debug: (target: string, msg: string, fields?: Record<string, unknown>) =>
    send("debug", target, msg, fields),
  info: (target: string, msg: string, fields?: Record<string, unknown>) =>
    send("info", target, msg, fields),
  warn: (target: string, msg: string, fields?: Record<string, unknown>) =>
    send("warn", target, msg, fields),
  error: (target: string, msg: string, fields?: Record<string, unknown>) =>
    send("error", target, msg, fields),
  fatal: (target: string, msg: string, fields?: Record<string, unknown>) =>
    send("fatal", target, msg, fields),
};

export async function getLogStatus(): Promise<LogStatus | null> {
  if (!isTauri) return null;
  try {
    return await invoke<LogStatus>("log_get_status");
  } catch {
    return null;
  }
}

export async function openLogDir(): Promise<void> {
  if (!isTauri) return;
  await invoke("log_open_dir");
}

export async function setLogProfile(profile: LogProfile): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string>("log_set_profile", { profile });
  } catch {
    return null;
  }
}

/** 导出近期日志为单文件,返回绝对路径;非 Tauri → null。 */
export async function exportLogBundle(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string>("log_export_bundle");
  } catch {
    return null;
  }
}
