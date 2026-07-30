import { describe, expect, it } from "vitest";
import {
  applyEnabledMap,
  collectPluginCommands,
  hasPermission,
  loadPluginFromManifest,
  parsePluginManifest,
  parsePluginMessage,
  registerPluginCommand,
  sampleHelloManifest,
  pluginEntryPath,
} from "./plugin-host";

describe("parsePluginManifest", () => {
  it("valid", () => {
    const m = parsePluginManifest(
      JSON.stringify(sampleHelloManifest()),
    );
    expect(m.id).toBe("hello");
    expect(m.permissions).toContain("commands.register");
  });

  it("rejects .. in main", () => {
    expect(() =>
      parsePluginManifest(
        JSON.stringify({
          ...sampleHelloManifest(),
          main: "../evil.js",
        }),
      ),
    ).toThrow();
  });

  it("strips unknown permissions", () => {
    const m = parsePluginManifest(
      JSON.stringify({
        ...sampleHelloManifest(),
        permissions: ["commands.register", "fs.write", "notes.read"],
      }),
    );
    expect(m.permissions).toEqual(["commands.register", "notes.read"]);
  });
});

describe("registerPluginCommand", () => {
  it("prefixes id", () => {
    let p = loadPluginFromManifest(sampleHelloManifest());
    p = registerPluginCommand(p, { id: "greet", label: "Hi" });
    expect(p.commands[0]?.id).toBe("hello.greet");
  });

  it("denies without permission", () => {
    const m = { ...sampleHelloManifest(), permissions: [] as const };
    const p = loadPluginFromManifest({
      ...m,
      permissions: [],
    });
    expect(() =>
      registerPluginCommand(p, { id: "x", label: "X" }),
    ).toThrow(/commands.register/);
  });
});

describe("collect / enable", () => {
  it("only enabled", () => {
    let a = loadPluginFromManifest(sampleHelloManifest());
    a = registerPluginCommand(a, { id: "g", label: "G" });
    const b = applyEnabledMap([a], { hello: false });
    expect(collectPluginCommands(b)).toEqual([]);
    expect(hasPermission(a.manifest, "ui.notify")).toBe(true);
  });
});

describe("parsePluginMessage", () => {
  it("accepts registerCommand", () => {
    expect(
      parsePluginMessage({
        type: "registerCommand",
        id: "a",
        label: "A",
      }),
    ).toEqual({ type: "registerCommand", id: "a", label: "A" });
  });
  it("rejects junk", () => {
    expect(parsePluginMessage({ type: "eval", code: "1" })).toBeNull();
  });
});

describe("paths", () => {
  it("entry path", () => {
    expect(pluginEntryPath("hello", "main.js")).toBe(
      ".openobs/plugins/hello/main.js",
    );
  });
});
