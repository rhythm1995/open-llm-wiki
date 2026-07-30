/**
 * edit-mode —— 编辑模式(source / wysiwyg)的归一与一次性迁移(纯逻辑)。
 *
 * 历史:早期默认是 source;后来默认改为 wysiwyg。凡是 localStorage 里因「旧默认」
 * 落成 `source` / 遗留 `edit`/`read` 的用户,在 v2 迁移键未写过时一次性切到 wysiwyg。
 * 迁移后再选手动切回 source 会保留(迁移键已写,不再覆盖)。
 */

export type EditMode = "source" | "wysiwyg";

export const EDIT_MODE_KEY = "openobs.editMode";
export const EDIT_MODE_MIGRATED_KEY = "openobs.editMode.migratedV2";

/** 原始存储值 → 合法模式。非 "wysiwyg" 一律 source(含 edit/read/null 等旧值)。 */
export function normalizeEditMode(raw: unknown): EditMode {
  return raw === "wysiwyg" ? "wysiwyg" : "source";
}

/**
 * 是否应做一次性「默认改 wysiwyg」迁移。
 * - 已写过迁移键 → 否
 * - 当前已是 wysiwyg → 是(仅写迁移键,值不变)
 * - 当前是 source/其它 → 是(切到 wysiwyg)
 */
export function shouldMigrateEditModeDefault(
  migratedFlag: string | null,
  currentRaw: unknown,
): boolean {
  if (migratedFlag === "1" || migratedFlag === "true") return false;
  // 未迁移过:无论当前值,都标记迁移;若非 wysiwyg 则改写。
  void currentRaw;
  return true;
}

/** 迁移后的目标模式:未迁移时统一落到 wysiwyg;已迁移则归一既有值。 */
export function migrateEditMode(
  migratedFlag: string | null,
  currentRaw: unknown,
): { mode: EditMode; writeMode: boolean; writeMigrated: boolean } {
  if (!shouldMigrateEditModeDefault(migratedFlag, currentRaw)) {
    return { mode: normalizeEditMode(currentRaw), writeMode: false, writeMigrated: false };
  }
  const mode: EditMode = "wysiwyg";
  const writeMode = normalizeEditMode(currentRaw) !== "wysiwyg";
  return { mode, writeMode, writeMigrated: true };
}
