/**
 * Shim for missing @ironcalc/wasm package snippets (npm omits snippets/*).
 * Implements timezone helpers expected by wasm.js glue via Intl.
 */

/** @param {string} tz */
export function ic_tz_validate(tz) {
  try {
    // Throws RangeError for invalid IANA names.
    new Intl.DateTimeFormat("en-US", { timeZone: String(tz || "UTC") }).format(
      0,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {number} epochMs
 * @param {string} tz
 * @returns {Int32Array} [year, month(1-12), day, hour, minute, second, weekday(0=Sun)]
 */
export function ic_tz_parts(epochMs, tz) {
  const timeZone = ic_tz_validate(tz) ? String(tz) : "UTC";
  const d = new Date(Number(epochMs));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = parts.find((x) => x.type === "weekday");
  const weekday = wd ? (wdMap[wd.value] ?? 0) : d.getUTCDay();
  return new Int32Array([
    get("year"),
    get("month"),
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
    weekday,
  ]);
}
