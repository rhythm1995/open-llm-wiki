/**
 * usePersistentState —— 持久化到 localStorage 的 useState(F-打磨)。
 *
 * 与 useTheme / useLocale 同构:懒读初值、变更即写。用于让"上次的主视图 / 编辑·阅读
 * 模式"在重启后恢复。读写均 try/catch:隐私模式 / 禁用 localStorage 时静默退化为
 * 纯内存 state(不抛、不崩)。key 命名约定 `openobs.<feature>`。
 */
import { useCallback, useRef, useState } from "react";

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  // 写盘时需要解析后的新值;用 ref 在 setValue 回调里拿到,避免重复计算。
  const keyRef = useRef(key);
  keyRef.current = key;

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(keyRef.current, JSON.stringify(resolved));
        } catch {
          // 忽略:存储不可用时退化为内存态。
        }
        return resolved;
      });
    },
    [],
  );

  return [value, set];
}
