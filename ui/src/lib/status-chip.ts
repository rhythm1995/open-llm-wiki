/**
 * status-chip —— status 字符串 → 彩色 chip 的启发式映射(共享色桶)。
 *
 * Inspector 的状态 chip 与 NoteListView 列表行的状态 chip 复用同一套色桶,
 * 故抽出为纯函数。按词根模糊匹配常见状态;颜色后续可配(P2)。
 */
export function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (/(active|open|in-progress|doing|draft|todo|backlog)/.test(s)) return "bg-green/15 text-green";
  if (/(done|complete|closed|shipped|resolved|finished)/.test(s)) return "bg-blue/15 text-blue";
  if (/(contest|disput|conflict|block|reject|fail)/.test(s)) return "bg-red/15 text-red";
  if (/(supersede|stale|deprecated|archiv|abandon|cancel|obsolete)/.test(s))
    return "bg-overlay/15 text-overlay";
  if (/(wait|pause|hold|review|pend)/.test(s)) return "bg-yellow/15 text-yellow";
  return "bg-surface text-subtext";
}
