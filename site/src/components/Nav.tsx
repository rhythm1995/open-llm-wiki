import { Link, useSearchParams } from "react-router-dom";
import { copy, type Locale } from "../lib/locale";

const REPO = "https://github.com/rhythm1995/open-llm-wiki";
const RELEASES = `${REPO}/releases`;

export function Nav({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [, setParams] = useSearchParams();
  const next = locale === "en" ? "zh" : "en";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-3 md:top-5">
      <nav
        className="nav-glass pointer-events-auto flex w-full max-w-[920px] items-center gap-2 rounded-[82px] px-3 py-2 md:px-5"
        aria-label="Primary"
      >
        <div className="hidden items-center gap-5 md:flex">
          <Link
            to={{ pathname: "/docs/start", search: locale === "zh" ? "?lang=zh" : "" }}
            className="text-[14px] font-medium text-bistre"
          >
            {t.docs}
          </Link>
          <a
            href={REPO}
            className="text-[14px] font-medium text-bistre"
            target="_blank"
            rel="noreferrer"
          >
            {t.github}
          </a>
        </div>
        <Link
          to={{ pathname: "/", search: locale === "zh" ? "?lang=zh" : "" }}
          className="mx-auto flex items-center gap-2"
        >
          <img src={`${import.meta.env.BASE_URL}olw-mark.png`} alt="" width={18} height={18} />
          <span className="font-display text-[18px] tracking-[-0.02em] text-bistre">
            Open LLM Wiki
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            className="px-2 text-[14px] font-medium text-graphite"
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
          <a href={RELEASES} className="text-[14px] font-medium text-bistre">
            {t.getApp}
          </a>
        </div>
      </nav>
    </header>
  );
}
