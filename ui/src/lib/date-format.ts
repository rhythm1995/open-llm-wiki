/**
 * date-format —— 列表行日期格式化(纯函数,可单测)。
 *
 * `modified` 是后端给的 unix 毫秒(瞬时,带时区);`created` 是 frontmatter 字符串
 * (通常 YYYY-MM-DD,日期粒度)。列表行要紧凑本地化:同年显 M/D,跨年显 YYYY/M/D。
 *
 * 所有函数把 `now` 作参数传入(不在内部读 Date.now())——保证单测确定性。
 * 日期串用手动拆解 YYYY-MM-DD 构造本地 Date,避免 `new Date("2026-07-25")` 按
 * UTC 解析导致的跨时区错位一天。
 */

/** 同年 → "M/D";跨年 → "YYYY/M/D"。 */
function compact(d: Date, nowYear: number): string {
  const y = d.getFullYear();
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return y === nowYear ? md : `${y}/${md}`;
}

/** unix 毫秒 → 紧凑日期;0/缺失/无效 → "—"。 */
export function formatMs(ms: number, now: number): string {
  if (!ms || ms <= 0) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return compact(d, new Date(now).getFullYear());
}

/** "YYYY-MM-DD"(或可解析串)→ 紧凑日期;不可解析 → 原样返回;null → "—"。 */
export function formatDateStr(str: string | null, now: number): string {
  if (!str) return "—";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return compact(d, new Date(now).getFullYear());
  }
  // 非 YYYY-MM-DD:交给 Date 尝试;失败则原样返回(不丢信息)。
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return compact(d, new Date(now).getFullYear());
}
