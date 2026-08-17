/**
 * HelpGuideDialog —— 顶栏 logo 打开的轻量「用户帮助手册」。
 * 浓缩欢迎台 / 理念 MG 要点 + 常用入口，不依赖当前是否已开 vault。
 */
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FolderOpen,
  Graph,
  Heartbeat,
  PlugsConnected,
  Robot,
  Command,
  Sparkle,
  Bug,
  X,
} from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";
import { openProjectIssues } from "../lib/project";

export function HelpGuideDialog({
  open,
  onOpenChange,
  t,
  showRestoreMg,
  onRestoreMg,
  onOpenAgentOnboard,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TFunc;
  /** corner 偏好时显示「恢复中央欢迎动画」。 */
  showRestoreMg?: boolean;
  onRestoreMg?: () => void;
  onOpenAgentOnboard?: () => void;
  onOpenSettings?: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] flex max-h-[min(560px,86vh)] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-crust bg-base shadow-2xl outline-none"
          data-testid="help-guide-dialog"
        >
          <div className="relative flex flex-col items-center gap-2 border-b border-crust bg-mantle px-5 pb-4 pt-6 text-center">
            <img
              src="/olw-mark.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
              draggable={false}
            />
            <Dialog.Title className="text-[16px] font-semibold tracking-tight text-text">
              {t("help.title")}
            </Dialog.Title>
            <Dialog.Description className="max-w-sm text-[12px] leading-relaxed text-subtext">
              {t("help.subtitle")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-3 top-3 rounded-lg p-1.5 text-overlay hover:bg-surface hover:text-text"
                aria-label={t("common.close")}
              >
                <X size={16} weight="bold" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <GuideCard
              icon={<FolderOpen size={16} weight="fill" className="text-blue" />}
              title={t("help.vaultTitle")}
              body={t("help.vaultBody")}
            />
            <GuideCard
              icon={<Graph size={16} weight="fill" className="text-blue" />}
              title={t("help.latticeTitle")}
              body={t("help.latticeBody")}
            />
            <GuideCard
              icon={<PlugsConnected size={16} weight="fill" className="text-blue" />}
              title={t("help.memoryTitle")}
              body={t("help.memoryBody")}
              action={
                onOpenAgentOnboard
                  ? {
                      label: t("help.memoryAction"),
                      onClick: () => {
                        onOpenChange(false);
                        onOpenAgentOnboard();
                      },
                    }
                  : undefined
              }
            />
            <GuideCard
              icon={<Robot size={16} weight="fill" className="text-blue" />}
              title={t("help.inAppAgentTitle")}
              body={t("help.inAppAgentBody")}
            />
            <GuideCard
              icon={<Heartbeat size={16} weight="fill" className="text-blue" />}
              title={t("help.healthTitle")}
              body={t("help.healthBody")}
            />
            <GuideCard
              icon={<Sparkle size={16} weight="fill" className="text-blue" />}
              title={t("help.distillTitle")}
              body={t("help.distillBody")}
              action={
                onOpenAgentOnboard
                  ? {
                      label: t("help.distillAction"),
                      onClick: () => {
                        onOpenChange(false);
                        onOpenAgentOnboard();
                      },
                    }
                  : onOpenSettings
                    ? {
                        label: t("help.settingsAction"),
                        onClick: () => {
                          onOpenChange(false);
                          onOpenSettings();
                        },
                      }
                    : undefined
              }
            />
            <GuideCard
              icon={<Bug size={16} weight="bold" className="text-blue" />}
              title={t("help.feedbackTitle")}
              body={t("help.feedbackBody")}
              action={{
                label: t("help.feedbackAction"),
                onClick: () => {
                  openProjectIssues();
                },
              }}
            />
            <GuideCard
              icon={<Command size={16} weight="bold" className="text-blue" />}
              title={t("help.shortcutsTitle")}
              body={t("help.shortcutsBody")}
              action={
                onOpenSettings
                  ? {
                      label: t("help.settingsAction"),
                      onClick: () => {
                        onOpenChange(false);
                        onOpenSettings();
                      },
                    }
                  : undefined
              }
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-crust bg-mantle px-4 py-3">
            {showRestoreMg && onRestoreMg ? (
              <button
                type="button"
                data-testid="help-restore-mg"
                onClick={() => {
                  onRestoreMg();
                  onOpenChange(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface1 bg-base px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface"
              >
                <Sparkle size={14} className="text-blue" weight="fill" />
                {t("help.restoreMg")}
              </button>
            ) : (
              <span className="text-[11px] text-overlay">{t("help.footerHint")}</span>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg bg-blue px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
              >
                {t("help.gotIt")}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GuideCard({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-crust bg-mantle/80 px-3 py-2.5 text-left">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue/10">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-text">{title}</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtext">{body}</p>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-2 text-[11.5px] font-medium text-blue hover:underline"
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
