import { Link, useSearchParams } from "react-router-dom";
import { BrandMark } from "./Brand";
import { copy, type Locale } from "../lib/locale";

const REPO = "https://github.com/rhythm1995/open-llm-wiki";
const RELEASES = `${REPO}/releases`;

export function Nav({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [, setParams] = useSearchParams();
  const next = locale === "en" ? "zh" : "en";
  const q = locale === "zh" ? "?lang=zh" : "";

  return (
    <header className="site-nav" aria-label="Primary">
      <div className="nav-slot nav-slot-left">
        <div className="nav-chip">
          <Link to={{ pathname: "/docs/start", search: q }} className="nav-item">
            {t.docs}
          </Link>
          <a href={REPO} className="nav-item" target="_blank" rel="noreferrer">
            {t.github}
          </a>
        </div>
      </div>

      <div className="nav-slot nav-slot-center">
        <Link to={{ pathname: "/", search: q }} className="nav-chip nav-brand">
          <BrandMark size={18} />
          <span>Open LLM Wiki</span>
        </Link>
      </div>

      <div className="nav-slot nav-slot-right">
        <div className="nav-chip">
          <button
            type="button"
            className="nav-item nav-item-muted"
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
      </div>
    </header>
  );
}
