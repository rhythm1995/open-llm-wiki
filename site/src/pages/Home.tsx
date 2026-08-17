import { useState } from "react";
import { Link } from "react-router-dom";
import { Lattice } from "../components/Lattice";
import { DOC_PAGES } from "../lib/docs";
import { copy, faqs, type Locale } from "../lib/locale";

const RELEASES = "https://github.com/rhythm1995/open-llm-wiki/releases";
const media = (name: string) => `${import.meta.env.BASE_URL}docs-media/${name}`;

export function Home({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const items = faqs[locale];
  const [open, setOpen] = useState(0);
  const shot = locale === "zh" ? "zh" : "en";
  const q = locale === "zh" ? "?lang=zh" : "";

  return (
    <main>
      <section className="mx-auto grid min-h-[100dvh] max-w-[1200px] items-center gap-12 px-6 pb-16 pt-28 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:pt-24">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
            {t.heroEyebrow}
          </p>
          <h1 className="font-display mt-4 max-w-[14ch] text-[44px] leading-[1.08] tracking-[-0.037em] text-bistre md:text-[54px]">
            {t.heroTitle}
          </h1>
          <p className="mt-5 max-w-[36ch] text-[18px] leading-[1.5] text-graphite md:text-[20px]">
            {t.heroSub}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={RELEASES}
              className="rounded-full bg-bistre px-6 py-[12px] text-[14px] font-medium text-pill-text"
            >
              {t.getApp}
            </a>
            <Link
              to={{ pathname: "/docs/start", search: q }}
              className="border border-bistre/90 px-6 py-[12px] text-[14px] font-medium text-bistre"
            >
              {t.readDocs}
            </Link>
          </div>
        </div>
        <Lattice className="mx-auto w-full max-w-[440px]" />
      </section>

      <section className="bg-cream">
        <div className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
            {t.surfacesEyebrow}
          </p>
          <h2 className="font-display mt-3 text-[36px] leading-[1.1] tracking-[-0.021em] text-bistre md:text-[48px]">
            {t.surfacesTitle}
          </h2>
          <p className="mt-4 max-w-[52ch] text-[18px] text-graphite md:text-[20px]">
            {t.latticeBody}
          </p>
          <figure className="mt-12">
            <img
              src={media(`editor-${shot}.png`)}
              alt={t.editorCap}
              className="w-full"
            />
            <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
              {t.editorCap}
            </figcaption>
          </figure>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <figure>
              <img src={media(`graph-${shot}.png`)} alt={t.graphCap} className="w-full" />
              <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                {t.graphCap}
              </figcaption>
            </figure>
            <figure>
              <img src={media(`health-${shot}.png`)} alt={t.healthCap} className="w-full" />
              <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                {t.healthCap}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
          {t.flywheelEyebrow}
        </p>
        <h2 className="font-display mt-3 max-w-[16ch] text-[36px] leading-[1.1] tracking-[-0.021em] text-bistre md:text-[48px]">
          {t.flywheelTitle}
        </h2>
        <p className="mt-5 max-w-[58ch] text-[18px] text-graphite md:text-[20px]">
          {t.flywheelBody}
        </p>
      </section>

      <section className="bg-cream">
        <div className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
            {t.docsEyebrow}
          </p>
          <h2 className="font-display mt-3 text-[36px] leading-[1.1] text-bistre md:text-[48px]">
            {t.docsTitle}
          </h2>
          <p className="mt-4 max-w-[52ch] text-[18px] text-graphite">{t.docsBody}</p>
          <ul className="mt-10">
            {DOC_PAGES.map((page) => (
              <li key={page.slug} className="border-b border-dashed hairline">
                <Link
                  to={{ pathname: `/docs/${page.slug}`, search: q }}
                  className="block py-5"
                >
                  <span className="font-display text-[24px] text-bistre">
                    {page.nav[locale]}
                  </span>
                  <span className="mt-1 block text-[14px] text-graphite">
                    {page.blurb[locale]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
          {t.faqEyebrow}
        </p>
        <h2 className="font-display mt-3 text-[36px] leading-[1.1] text-bistre md:text-[48px]">
          {t.faqTitle}
        </h2>
        <p className="mt-4 max-w-[48ch] text-[18px] text-graphite">{t.faqLead}</p>
        <div className="mt-10">
          {items.map((item, i) => {
            const on = open === i;
            return (
              <div key={item.q} className="border border-dashed hairline bg-cream">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? -1 : i)}
                >
                  <span className="font-display text-[20px] leading-[1.25] text-bistre md:text-[24px]">
                    {item.q}
                  </span>
                  <span className="text-[22px] text-bistre" aria-hidden>
                    {on ? "−" : "+"}
                  </span>
                </button>
                {on ? (
                  <p className="border-t border-dashed hairline px-5 py-4 text-[16px] text-graphite">
                    {item.a}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-dashed hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <h2 className="font-display text-[36px] leading-[1.1] text-bistre md:text-[48px]">
            {t.closeCta}
          </h2>
          <p className="mt-4 max-w-[42ch] text-[18px] text-graphite">{t.closeBody}</p>
          <div className="mt-8">
            <Link
              to={{ pathname: "/docs/start", search: q }}
              className="border border-bistre px-6 py-3 text-[14px] font-medium text-bistre"
            >
              {t.readDocs}
            </Link>
          </div>
          <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
            {t.footerHint}
          </p>
        </div>
      </section>
    </main>
  );
}
