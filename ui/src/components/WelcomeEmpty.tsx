/**
 * WelcomeEmpty —— 无 vault 时的中心欢迎台(首次安装 / 未打开库)。
 *
 * 与「有 vault 但未选笔记」的 empty.selectOrCreate 分流:
 * - 主 CTA:打开本机 Markdown 文件夹
 * - 次要:创建示例 Vault
 * - 最近打开列表
 * - 拖入文件夹(Tauri 桌面;浏览器降级提示)
 * - 理念 MG:默认中央;可关闭并选择「以后默认右上角 logo」
 */
import { useCallback, useEffect, useState } from "react";
import {
  FolderOpen,
  Sparkle,
  ClockCounterClockwise,
  X,
} from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import type { TFunc } from "../lib/i18n";
import { readRecentRoots, forgetRecentRoot } from "../lib/last-note";
import { ipc } from "../lib/ipc";
import { WelcomePhilosophyMg } from "./WelcomePhilosophyMg";
import {
  readWelcomeMgPlacement,
  writeWelcomeMgPlacement,
  type WelcomeMgPlacement,
} from "../lib/welcome-mg-pref";

export interface WelcomeEmptyProps {
  t: TFunc;
  /** 打开系统文件夹选择器。 */
  onOpenVault: () => void | Promise<void>;
  /** 直接打开给定路径(最近列表 / 拖放)。返回是否成功。 */
  onOpenRoot: (root: string) => Promise<boolean>;
  /** 创建示例库并打开;返回路径或 null。 */
  onCreateSample: () => Promise<string | null>;
  /** 忙碌态(打开/创建中)禁用按钮。 */
  busy?: boolean;
  /** MG 收起到 corner 后通知父级(刷新顶栏 logo)。 */
  onMgPlacementChange?: (placement: WelcomeMgPlacement) => void;
  /** 桌面端:打开「设置 → Agent 记忆接入」。 */
  onOpenAgentOnboard?: () => void;
}

/** 路径末段作展示名;根路径则整段。 */
export function displayVaultName(root: string): string {
  const norm = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] || root;
}

export function WelcomeEmpty({
  t,
  onOpenVault,
  onOpenRoot,
  onCreateSample,
  busy = false,
  onMgPlacementChange,
  onOpenAgentOnboard,
}: WelcomeEmptyProps) {
  const [recent, setRecent] = useState<string[]>(() => readRecentRoots());
  const [dragOver, setDragOver] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [placement, setPlacement] = useState<WelcomeMgPlacement>(() =>
    readWelcomeMgPlacement(),
  );
  /** 本会话是否已关掉中央 MG(未勾选记住时)。 */
  const [sessionMgHidden, setSessionMgHidden] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [rememberCorner, setRememberCorner] = useState(true);
  const blocked = busy || localBusy;

  const showHeroMg = placement === "hero" && !sessionMgHidden;

  const refreshRecent = useCallback(() => {
    setRecent(readRecentRoots());
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    if (ipc.isMock()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === "over" || payload.type === "enter") {
            setDragOver(true);
          } else if (payload.type === "leave") {
            setDragOver(false);
          } else if (payload.type === "drop") {
            setDragOver(false);
            const paths = "paths" in payload ? payload.paths : [];
            const first = paths[0];
            if (!first) return;
            setLocalBusy(true);
            setErr(null);
            void onOpenRoot(first)
              .then((ok) => {
                if (!ok) {
                  forgetRecentRoot(first);
                  refreshRecent();
                  setErr(t("welcome.openFailed"));
                }
              })
              .finally(() => setLocalBusy(false));
          }
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onOpenRoot, refreshRecent, t]);

  const handleOpenRecent = async (root: string) => {
    setLocalBusy(true);
    setErr(null);
    try {
      const ok = await onOpenRoot(root);
      if (!ok) {
        forgetRecentRoot(root);
        refreshRecent();
        setErr(t("welcome.openFailed"));
      }
    } finally {
      setLocalBusy(false);
    }
  };

  const handleSample = async () => {
    setLocalBusy(true);
    setErr(null);
    try {
      const path = await onCreateSample();
      if (!path) setErr(t("welcome.sampleFailed"));
      else refreshRecent();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLocalBusy(false);
    }
  };

  const handleRemoveRecent = (root: string, e: React.MouseEvent) => {
    e.stopPropagation();
    forgetRecentRoot(root);
    refreshRecent();
  };

  const confirmCloseMg = () => {
    setSessionMgHidden(true);
    setCloseDialogOpen(false);
    if (rememberCorner) {
      writeWelcomeMgPlacement("corner");
      setPlacement("corner");
      onMgPlacementChange?.("corner");
    }
  };

  return (
    <div
      data-testid="welcome-empty"
      className={
        "flex h-full w-full flex-col items-center justify-center overflow-auto bg-base px-6 py-10 " +
        (dragOver ? "ring-2 ring-inset ring-blue/50 bg-blue/5" : "")
      }
      data-drag-region
    >
      <div
        className="flex w-full max-w-md flex-col items-center gap-6 text-center"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showHeroMg ? (
          <WelcomePhilosophyMg
            t={t}
            onClose={() => {
              setRememberCorner(true);
              setCloseDialogOpen(true);
            }}
          />
        ) : (
          <img
            src="/olw-mark.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 select-none object-contain"
            draggable={false}
            data-testid="welcome-logo-static"
          />
        )}

        <div className="space-y-1.5">
          <h1 className="text-[22px] font-semibold tracking-tight text-text">
            {t("welcome.title")}
          </h1>
          <p className="text-[13px] leading-relaxed text-subtext">
            {t("welcome.tagline")}
          </p>
        </div>

        <p className="max-w-sm text-[12px] leading-relaxed text-overlay">
          {t("welcome.vaultExplain")}
        </p>

        <div className="flex w-full flex-col gap-2.5">
          <button
            type="button"
            data-testid="welcome-open-vault"
            disabled={blocked}
            onClick={() => void onOpenVault()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue px-4 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <FolderOpen size={18} weight="bold" />
            {t("welcome.openFolder")}
          </button>
          <button
            type="button"
            data-testid="welcome-create-sample"
            disabled={blocked}
            onClick={() => void handleSample()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-surface1 bg-mantle px-4 text-[13px] font-medium text-text transition hover:bg-surface0 disabled:opacity-50"
          >
            <Sparkle size={18} weight="bold" className="text-blue" />
            {t("welcome.createSample")}
          </button>
          {onOpenAgentOnboard && !ipc.isMock() && (
            <button
              type="button"
              data-testid="welcome-agent-onboard"
              onClick={onOpenAgentOnboard}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[12px] font-medium text-blue hover:bg-blue/10"
            >
              {t("welcome.agentOnboard")}
            </button>
          )}
        </div>

        {!ipc.isMock() && (
          <p className="text-[11px] text-overlay">{t("welcome.dropHint")}</p>
        )}

        {err && (
          <p
            data-testid="welcome-error"
            className="w-full rounded-md border border-red/30 bg-red/10 px-3 py-2 text-left text-[12px] text-red"
          >
            {err}
          </p>
        )}

        {recent.length > 0 && (
          <div className="w-full text-left">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-overlay">
              <ClockCounterClockwise size={12} />
              {t("welcome.recent")}
            </div>
            <ul className="overflow-hidden rounded-lg border border-surface1 bg-mantle">
              {recent.map((root) => (
                <li
                  key={root}
                  className="flex items-center border-b border-surface0 last:border-b-0"
                >
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => void handleOpenRecent(root)}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[12px] text-text hover:bg-surface0 disabled:opacity-50"
                    title={root}
                  >
                    <span className="font-medium">{displayVaultName(root)}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-overlay">
                      {root}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 p-2 text-overlay hover:text-text"
                    title={t("welcome.removeRecent")}
                    aria-label={t("welcome.removeRecent")}
                    onClick={(e) => handleRemoveRecent(root, e)}
                  >
                    <X size={12} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Dialog.Root open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[min(360px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-crust bg-base p-4 shadow-xl">
            <Dialog.Title className="text-[14px] font-semibold text-text">
              {t("welcome.mg.closeTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[12px] leading-relaxed text-subtext">
              {t("welcome.mg.closeBody")}
            </Dialog.Description>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-left text-[12px] text-text">
              <input
                type="checkbox"
                data-testid="welcome-mg-remember"
                checked={rememberCorner}
                onChange={(e) => setRememberCorner(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t("welcome.mg.rememberCorner")}</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-[12px] text-subtext hover:bg-surface hover:text-text"
                >
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                data-testid="welcome-mg-confirm-close"
                onClick={confirmCloseMg}
                className="rounded-lg bg-blue px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
              >
                {t("welcome.mg.confirmClose")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
