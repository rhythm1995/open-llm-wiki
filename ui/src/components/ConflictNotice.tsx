/**
 * ConflictNotice —— 云同步冲突副本提示卡(doc 17 G5)。
 *
 * scan_conflicts 检出 `X N.md` 与 `X.md` 并存时列出;每对可打开原文件/副本对比,
 * 或「忽略此项」(per root 持久化)。绝不自动合并或删除——副本有时才是新改动。
 */
import { useState } from "react";
import { Copy } from "@phosphor-icons/react";
import type { ConflictPair } from "../lib/ipc";
import {
  ignoreConflict,
  readIgnoredConflicts,
  visibleConflicts,
} from "../lib/storage-notice";
import type { TFunc } from "../lib/i18n";

export interface ConflictNoticeProps {
  root: string;
  pairs: ConflictPair[];
  t: TFunc;
  /** 打开一篇笔记(并排对比由用户自行开第二标签)。 */
  onOpenNote: (path: string) => void;
}

export function ConflictNotice({ root, pairs, t, onOpenNote }: ConflictNoticeProps) {
  const [ignored, setIgnored] = useState(() =>
    readIgnoredConflicts((k) => window.localStorage.getItem(k), root),
  );
  const visible = visibleConflicts(pairs, ignored);
  if (visible.length === 0) return null;

  const handleIgnore = (copy: string) => {
    ignoreConflict(
      (k) => window.localStorage.getItem(k),
      (k, v) => window.localStorage.setItem(k, v),
      root,
      copy,
    );
    setIgnored(readIgnoredConflicts((k) => window.localStorage.getItem(k), root));
  };

  return (
    <div
      data-testid="conflict-notice"
      className="border-b border-mauve/40 bg-mauve/10 px-3 py-1.5 text-[12px] text-text"
    >
      <div className="flex items-center gap-1.5">
        <Copy size={13} weight="bold" className="shrink-0 text-mauve" />
        <span className="font-medium">{t("conflict.title", { n: visible.length })}</span>
      </div>
      <p className="mt-0.5 text-subtext">{t("conflict.body")}</p>
      <ul className="mt-1 space-y-1">
        {visible.map((p) => (
          <li
            key={p.copy}
            data-testid="conflict-row"
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              data-testid="conflict-open-base"
              onClick={() => onOpenNote(p.base)}
              className="rounded border border-surface1 bg-mantle px-2 py-0.5 text-[11px] hover:bg-surface0"
              title={p.base}
            >
              {t("conflict.openBase")} · {p.base}
            </button>
            <button
              type="button"
              data-testid="conflict-open-copy"
              onClick={() => onOpenNote(p.copy)}
              className="rounded border border-surface1 bg-mantle px-2 py-0.5 text-[11px] hover:bg-surface0"
              title={p.copy}
            >
              {t("conflict.openCopy")} · {p.copy}
            </button>
            <button
              type="button"
              data-testid="conflict-ignore"
              onClick={() => handleIgnore(p.copy)}
              className="rounded px-1.5 py-0.5 text-[11px] text-overlay hover:text-text"
            >
              {t("conflict.ignore")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
