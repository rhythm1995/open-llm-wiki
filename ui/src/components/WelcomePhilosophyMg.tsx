/**
 * WelcomePhilosophyMg —— 首次无 Vault 理念片(v4)。
 *
 * 三幕循环:文件即真相 → 灯泡晶格连线(定格批准 raster) → Agent 蒸馏。
 * 主标终帧只用 `/olw-mark.png`(VI 板锁定)。脚手架 path 仅作描线动效。
 * 规格见 docs/16-first-run-mg-philosophy.md。
 */
import { X } from "@phosphor-icons/react";
import type { TFunc } from "../lib/i18n";
import "./welcome-mg.css";

export function WelcomePhilosophyMg({
  t,
  onClose,
}: {
  t: TFunc;
  /** 关闭动画(弹出是否收起到右上角的确认)。 */
  onClose?: () => void;
}) {
  return (
    <div className="welcome-mg" data-testid="welcome-mg" aria-hidden={false}>
      {onClose && (
        <button
          type="button"
          data-testid="welcome-mg-close"
          onClick={onClose}
          className="welcome-mg__close"
          aria-label={t("welcome.mg.close")}
          title={t("welcome.mg.close")}
        >
          <X size={14} weight="bold" />
        </button>
      )}
      <div className="welcome-mg__stage">
        {/* reduced-motion 静态主标 */}
        <div className="welcome-mg__scene welcome-mg__scene--static">
          <img
            className="welcome-mg__mark-png welcome-mg__mark-png--static"
            src="/olw-mark.png"
            alt=""
            width={72}
            height={72}
          />
        </div>

        {/* 1 · files */}
        <div className="welcome-mg__scene welcome-mg__scene--files">
          <div className="welcome-mg__files">
            <div className="welcome-mg__file">
              <span className="welcome-mg__file-label">.md</span>
            </div>
            <div className="welcome-mg__file">
              <span className="welcome-mg__file-label">.md</span>
            </div>
            <div className="welcome-mg__file">
              <span className="welcome-mg__file-label">.md</span>
            </div>
          </div>
          <div className="welcome-mg__disk">
            <i />
            {t("welcome.mg.disk")}
          </div>
          <div className="welcome-mg__caption">
            {t("welcome.mg.filesCaptionBefore")}
            <strong style={{ color: "var(--mg-sky)", fontWeight: 500 }}>
              {t("welcome.mg.filesCaptionStrong")}
            </strong>
            {t("welcome.mg.filesCaptionAfter")}
          </div>
        </div>

        {/* 2 · lattice line-draw → approved PNG */}
        <div className="welcome-mg__scene welcome-mg__scene--mark">
          <div className="welcome-mg__mark-stage">
            <svg className="welcome-mg__draw" viewBox="0 0 100 100">
              <path
                className="welcome-mg__stroke welcome-mg__stroke--1"
                pathLength={1}
                d="M50 14 C66 14 78 26 80 40 C81 50 76 58 68 66 L62 72 L50 74 L38 72 L32 66 C24 58 19 50 20 40 C22 26 34 14 50 14 Z"
              />
              <path
                className="welcome-mg__stroke welcome-mg__stroke--2"
                pathLength={1}
                d="M50 28 L62 34 L62 48 L50 56 L38 48 L38 34 Z"
              />
              <path
                className="welcome-mg__stroke welcome-mg__stroke--3"
                pathLength={1}
                d="M50 42 L50 28 M50 42 L62 34 M50 42 L62 48 M50 42 L50 56 M50 42 L38 48 M50 42 L38 34"
              />
              <path
                className="welcome-mg__stroke welcome-mg__stroke--4"
                pathLength={1}
                d="M50 28 L50 14 M62 34 L74 28 M62 48 L78 48 M50 56 L62 72 M50 56 L38 72 M38 48 L22 48 M38 34 L26 28 M50 74 L50 78"
              />
              <g className="welcome-mg__nodes">
                <circle cx="50" cy="14" r="2.2" />
                <circle cx="74" cy="28" r="2" />
                <circle cx="80" cy="42" r="2" />
                <circle cx="68" cy="66" r="2" />
                <circle cx="62" cy="72" r="1.8" />
                <circle cx="50" cy="74" r="1.8" />
                <circle cx="38" cy="72" r="1.8" />
                <circle cx="32" cy="66" r="2" />
                <circle cx="20" cy="42" r="2" />
                <circle cx="26" cy="28" r="2" />
                <circle cx="50" cy="28" r="1.8" />
                <circle cx="62" cy="34" r="1.8" />
                <circle cx="62" cy="48" r="1.8" />
                <circle cx="50" cy="56" r="1.8" />
                <circle cx="38" cy="48" r="1.8" />
                <circle cx="38" cy="34" r="1.8" />
                <circle cx="50" cy="42" r="2.4" />
              </g>
              <rect
                className="welcome-mg__stroke welcome-mg__stroke--4"
                pathLength={1}
                x="36"
                y="80"
                width="28"
                height="3.2"
                rx="1.5"
              />
              <rect
                className="welcome-mg__stroke welcome-mg__stroke--4"
                pathLength={1}
                x="40"
                y="86"
                width="20"
                height="3.2"
                rx="1.5"
              />
            </svg>
            <img
              className="welcome-mg__mark-png"
              src="/olw-mark.png"
              alt=""
              width={96}
              height={96}
            />
          </div>
          <div className="welcome-mg__cap-mark">
            <em>[[wikilink]]</em> {t("welcome.mg.markCaption")}
          </div>
        </div>

        {/* 3 · agent distill */}
        <div className="welcome-mg__scene welcome-mg__scene--distill">
          <div className="welcome-mg__agent-flow">
            <div className="welcome-mg__card welcome-mg__card--agent">
              <div className="welcome-mg__badge">
                <i />
                Agent
              </div>
              <div className="welcome-mg__bubble">
                <b>{t("welcome.mg.agentTitle")}</b>
                <br />
                {t("welcome.mg.agentBody")}
              </div>
            </div>
            <div className="welcome-mg__pipe">
              <div className="welcome-mg__arrow" />
              <span>DISTILL</span>
              <div className="welcome-mg__arrow" />
            </div>
            <div className="welcome-mg__card welcome-mg__card--vault">
              <div className="welcome-mg__vault-title">{t("welcome.mg.vaultTitle")}</div>
              <div className="welcome-mg__note-row">
                <span className="welcome-mg__dot" />
                Concept
              </div>
              <div className="welcome-mg__note-row">
                <span className="welcome-mg__dot" />
                Entity
              </div>
              <div className="welcome-mg__note-row">
                <span className="welcome-mg__dot" />
                Summary
              </div>
            </div>
          </div>
          <div className="welcome-mg__distill-tag">
            Distill <span>what matters</span>.
          </div>
          <div className="welcome-mg__caption">{t("welcome.mg.distillCaption")}</div>
        </div>

        <div className="welcome-mg__progress">
          <i />
        </div>
      </div>
    </div>
  );
}
