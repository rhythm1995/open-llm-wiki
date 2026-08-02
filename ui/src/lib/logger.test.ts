import { describe, expect, it, vi, beforeEach } from "vitest";

describe("logger (mock / non-tauri)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("log.info 在非 Tauri 下走 console 且不抛", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { log } = await import("./logger");
    expect(() => log.info("test", "hello", { n: 1 })).not.toThrow();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("getLogStatus 非 Tauri 返回 null", async () => {
    const { getLogStatus } = await import("./logger");
    await expect(getLogStatus()).resolves.toBeNull();
  });
});
