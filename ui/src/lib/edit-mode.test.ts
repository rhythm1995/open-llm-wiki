import { describe, expect, it } from "vitest";
import {
  migrateEditMode,
  normalizeEditMode,
  shouldMigrateEditModeDefault,
} from "./edit-mode";

describe("normalizeEditMode", () => {
  it("wysiwyg 保留", () => {
    expect(normalizeEditMode("wysiwyg")).toBe("wysiwyg");
  });
  it("source / edit / read / 其它 → source", () => {
    expect(normalizeEditMode("source")).toBe("source");
    expect(normalizeEditMode("edit")).toBe("source");
    expect(normalizeEditMode("read")).toBe("source");
    expect(normalizeEditMode(null)).toBe("source");
  });
});

describe("shouldMigrateEditModeDefault", () => {
  it("已迁移 → false", () => {
    expect(shouldMigrateEditModeDefault("1", "source")).toBe(false);
    expect(shouldMigrateEditModeDefault("true", "source")).toBe(false);
  });
  it("未迁移 → true", () => {
    expect(shouldMigrateEditModeDefault(null, "source")).toBe(true);
    expect(shouldMigrateEditModeDefault(null, "wysiwyg")).toBe(true);
  });
});

describe("migrateEditMode", () => {
  it("未迁移 + source → wysiwyg 并写模式与标记", () => {
    const r = migrateEditMode(null, "source");
    expect(r).toEqual({ mode: "wysiwyg", writeMode: true, writeMigrated: true });
  });
  it("未迁移 + 已是 wysiwyg → 只写标记", () => {
    const r = migrateEditMode(null, "wysiwyg");
    expect(r).toEqual({ mode: "wysiwyg", writeMode: false, writeMigrated: true });
  });
  it("已迁移 + source → 保留 source", () => {
    const r = migrateEditMode("1", "source");
    expect(r).toEqual({ mode: "source", writeMode: false, writeMigrated: false });
  });
});
