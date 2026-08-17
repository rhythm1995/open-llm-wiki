/**
 * wiki-labels —— vault 软类型 / status 的**展示**本地化。
 *
 * frontmatter 里仍写英文规范词(Source / Active…);UI 用本模块把已知词译成当前语言。
 * 未知自定义 type/status **原样显示**(约定优于配置,不强制词表)。
 *
 * i18n 键:wiki.type.<Canonical> / wiki.status.<Canonical>(大小写敏感键名用规范形)。
 */

import type { TFunc } from "./i18n";

/** 常见 type → 规范词(i18n 后缀);lookup 忽略大小写。 */
const TYPE_CANON: Record<string, string> = {
  source: "Source",
  summary: "Summary",
  entity: "Entity",
  concept: "Concept",
  note: "Note",
  query: "Query",
  type: "Type",
  typedoc: "TypeDoc",
};

/** 常见 status → 规范词。 */
const STATUS_CANON: Record<string, string> = {
  active: "Active",
  contested: "Contested",
  superseded: "Superseded",
  unprocessed: "Unprocessed",
  digested: "Digested",
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  done: "Done",
  todo: "Todo",
  backlog: "Backlog",
  review: "Review",
  pending: "Pending",
  archived: "Archived",
  deprecated: "Deprecated",
};

function canonOf(
  table: Record<string, string>,
  raw: string,
): string | null {
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  return table[k] ?? null;
}

/**
 * 展示用类型名。空串 → 空串;已知 → t("wiki.type.X");未知 → 原文。
 */
export function labelType(type: string | null | undefined, t: TFunc): string {
  if (type == null) return "";
  const raw = type.trim();
  if (!raw) return "";
  const canon = canonOf(TYPE_CANON, raw);
  if (!canon) return raw;
  const key = `wiki.type.${canon}`;
  const translated = t(key);
  // TFunc 未知键通常回退为 key 本身;若未登记则显示原文。
  return translated === key ? raw : translated;
}

/**
 * 展示用 status。规则同 {@link labelType}。
 */
export function labelStatus(
  status: string | null | undefined,
  t: TFunc,
): string {
  if (status == null) return "";
  const raw = status.trim();
  if (!raw) return "";
  const canon = canonOf(STATUS_CANON, raw);
  if (!canon) return raw;
  const key = `wiki.status.${canon}`;
  const translated = t(key);
  return translated === key ? raw : translated;
}
