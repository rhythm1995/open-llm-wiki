import { motion } from "motion/react";
import { Link, useSearchParams } from "react-router-dom";
import { copy, type Locale } from "../lib/locale";
import { uiTransition } from "../lib/motion";

const REPO = "https://github.com/rhythm1995/open-llm-wiki";
const RELEASES = `${REPO}/releases`;

export function Nav({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [, setParams] = useSearchParams();
  const next = locale === "en" ? "zh" : "en";
  const q = locale === "zh" ? "?lang=zh" : "";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-3 md:top-5">
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...uiTransition, duration: 0.45 }}
        className="nav-glass pointer-events-auto flex w-full max-w-[920px] items-center gap-2 rounded-[82px] px-3 py-2 md:px-5"
        aria-label="Primary"
      >
        <div className="hidden min-w-[168px] items-center gap-5 md:flex">
          <Link
            to={{ pathname: "/docs/start", search: q }}
            className="nav-link text-[14px] font-medium text-bistre"
          >
            {t.docs}
          </Link>
          <a
            href={REPO}
            className="nav-link text-[14px] font-medium text-bistre"
            target="_blank"
            rel="noreferrer"
          >
            {t.github}
          </a>
        </div>
        <Link
          to={{ pathname: "/", search: q }}
          className="mx-auto flex items-center gap-2"
        >
          <img src={`${import.meta.env.BASE_URL}olw-mark.png`} alt="" width={18} height={18} />
          <span className="font-display text-[18px] tracking-[-0.02em] text-bistre">
            Open LLM Wiki
          </span>
        </Link>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2 md:min-w-[168px] md:ml-0">
          <button
            type="button"
            className="nav-link px-2 text-[14px] font-medium text-graphite"
            onClick={() =>
              setParams((p) => {
                const nextParams = new URLSearchParams(p);
                if (next === "en") nextParams.delete("lang");
                else nextParams.set("lang", "zh");
                return nextParams;
              })
            }
          >
            {t.langSwitch}
          </button>
          <a href={RELEASES} className="btn-pill">
            {t.getApp}
          </a>
        </div>
      </motion.nav>
    </header>
  );
}
