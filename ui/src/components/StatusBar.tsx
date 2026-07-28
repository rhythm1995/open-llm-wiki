/**
 * StatusBar —— 底栏:保存状态 + 当前路径 + 节点计数 + mock 模式提示。
 */
import { Check, CircleNotch } from "@phosphor-icons/react";
import type { VaultState } from "../lib/store";
import type { TFunc } from "../lib/i18n";
import { ipc } from "../lib/ipc";

interface Props {
  state: VaultState;
  t: TFunc;
}

export function StatusBar({ state, t }: Props) {
  return (
    <div className="flex items-center gap-3 border-t border-crust bg-mantle px-3 py-1 text-[11px] text-overlay">
      {state.saveState === "saving" ? (
        <span className="flex items-center gap-1 text-yellow">
          <CircleNotch size={11} /> {t("status.saving")}
        </span>
      ) : state.saveState === "saved" ? (
        <span className="flex items-center gap-1 text-green">
          <Check size={11} weight="bold" /> {t("status.saved")}
        </span>
      ) : state.dirty ? (
        <span className="text-overlay">{t("status.dirty")}</span>
      ) : (
        <span>{t("status.idle")}</span>
      )}
      {state.currentPath && (
        <span className="truncate text-subtext">{state.currentPath}</span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {state.snapshot && (
          <span>{t("status.notes", { n: state.snapshot.nodes.length })}</span>
        )}
        {ipc.isMock() && (
          <span className="rounded bg-surface px-1.5 py-0.5 text-yellow">
            {t("status.mock")}
          </span>
        )}
      </span>
    </div>
  );
}
