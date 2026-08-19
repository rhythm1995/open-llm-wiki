import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLockup } from "../components/Brand";
import { JumpSections } from "../components/JumpSections";
import { OrbitRing } from "../components/OrbitRing";
import { PrinciplesStage } from "../components/PrinciplesStage";
import { Reveal } from "../components/Reveal";
import { SurfacesStage } from "../components/SurfacesStage";
import { DOC_PAGES } from "../lib/docs";
import { gsap, SplitText, useGSAP } from "../lib/gsap";
import { copy, faqs, type Locale } from "../lib/locale";

const RELEASES = "https://github.com/rhythm1995/open-llm-wiki/releases";

export function Home({ locale }: { locale: Locale }) {
  const mainRef = useRef<HTMLElement>(null);
  const t = copy[locale];
  const items = faqs[locale];
  const [open, setOpen] = useState(-1);
  const q = locale === "zh" ? "?lang=zh" : "";
  const jumps = [
    { id: "hero", label: t.heroEyebrow },
    { id: "essay", label: t.essayEyebrow },
    { id: "sit", label: t.sitEyebrow },
    { id: "surfaces", label: t.surfacesEyebrow },
    { id: "handbook", label: t.docsEyebrow },
    { id: "faq", label: t.faqEyebrow },
  ];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const title = mainRef.current?.querySelector<HTMLElement>(".hero-title");
        const chinese = locale === "zh";

        if (title) {
          SplitText.create(title, {
            type: chinese ? "chars" : "words",
            mask: chinese ? "chars" : "words",
            autoSplit: true,
            onSplit(self) {
              const units = chinese ? self.chars : self.words;
              return gsap.from(units, {
                yPercent: 110,
                duration: 0.7,
                stagger: chinese ? 0.028 : 0.045,
                ease: "power3.out",
              });
            },
          });
        }

        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        intro
          .from(".hero-kicker", { autoAlpha: 0, y: 12, duration: 0.4 }, 0)
          .from(".hero-sub", { autoAlpha: 0, y: 14, duration: 0.45 }, 0.14)
          .from(".hero-cta", { autoAlpha: 0, y: 12, duration: 0.4 }, 0.2)
          .from(".hero-lattice", { autoAlpha: 0, scale: 0.97, duration: 0.6 }, 0.08);
      });
      return () => mm.revert();
    },
    { scope: mainRef, dependencies: [locale], revertOnUpdate: true },
  );

  return (
    <main ref={mainRef}>
      <section
        id="hero"
        className="mx-auto grid min-h-[100dvh] max-w-[1200px] items-center gap-10 px-6 pb-20 pt-24 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-8"
      >
        <div>
          <div className="hero-kicker">
            <BrandLockup size={52} wordClass="font-display text-[22px] tracking-[-0.02em] text-bistre md:text-[24px]" />
          </div>
          <h1
            key={locale}
            className="hero-title split-ready font-display mt-5 max-w-[12ch] text-[48px] leading-[1.12] tracking-[-0.037em] text-bistre md:text-[54px]"
          >
            {t.heroTitle}
          </h1>
          <p className="hero-sub mt-5 max-w-[34ch] text-[18px] leading-[1.5] text-graphite md:text-[20px]">
            {t.heroSub}
          </p>
          <div className="hero-cta mt-9 flex flex-wrap items-center gap-3">
            <a href={RELEASES} className="btn-hero">
              {t.getApp}
            </a>
            <Link to={{ pathname: "/docs/start", search: q }} className="btn-ghost btn-ghost-lg">
              {t.readDocs}
            </Link>
          </div>
        </div>
        <div className="hero-lattice">
          <OrbitRing className="mx-auto aspect-square w-full max-w-[520px]" />
        </div>
      </section>

      <section id="essay" className="border-t border-dashed hairline">
        <div className="mx-auto max-w-[760px] px-6 py-[100px] md:py-[120px]">
          <blockquote className="mb-14">
            <span className="font-display block text-[56px] leading-none text-bistre">
              “
            </span>
            <Reveal>
              <p className="font-display -mt-4 text-[28px] leading-[1.22] tracking-[-0.021em] text-bistre md:text-[36px]">
                {t.quote}
              </p>
            </Reveal>
            <p className="mt-5 text-[14px] text-bistre">
              {t.quoteBy}
              <span className="text-graphite"> / {t.quoteRole}</span>
            </p>
          </blockquote>
          <Reveal delay={0.06}>
            <p className="drop-cap text-[16px] leading-[1.6] text-bistre">{t.essayP1}</p>
            <p className="mt-5 text-[16px] leading-[1.6] text-graphite">{t.essayP2}</p>
          </Reveal>
        </div>
      </section>

      <PrinciplesStage locale={locale} />
      <SurfacesStage locale={locale} />

      <section id="handbook" className="bg-cream">
        <div className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
                {t.docsEyebrow}
              </p>
              <h2 className="font-display mt-3 text-[36px] leading-[1.1] text-bistre md:text-[48px]">
                {t.docsTitle}
              </h2>
              <p className="mt-4 max-w-[52ch] text-[18px] text-graphite">{t.docsBody}</p>
            </div>
            <Link to={{ pathname: "/docs/start", search: q }} className="btn-view">
              {t.viewAll}
            </Link>
          </Reveal>
          <ul className="mt-10">
            {DOC_PAGES.map((page, i) => (
              <Reveal key={page.slug} delay={i * 0.04}>
                <li className="border-b border-dashed hairline">
                  <Link
                    to={{ pathname: `/docs/${page.slug}`, search: q }}
                    className="log-row group flex flex-col gap-1 py-6 md:flex-row md:items-baseline md:justify-between"
                  >
                    <span className="font-display text-[24px] text-bistre transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-graphite">
                      {page.nav[locale]}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                      {page.blurb[locale]}
                    </span>
                  </Link>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq">
        <div className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
              {t.faqEyebrow}
            </p>
            <h2 className="font-display mt-3 text-[36px] leading-[1.1] text-bistre md:text-[48px]">
              {t.faqTitle}
            </h2>
            <p className="mt-4 max-w-[48ch] text-[18px] text-graphite">{t.faqLead}</p>
          </Reveal>
          <div className="mt-10">
            {items.map((item, i) => {
              const on = open === i;
              return (
                <div key={item.q} className="border border-dashed hairline bg-cream">
                  <button
                    type="button"
                    className="faq-head flex w-full items-center justify-between gap-4 px-5 py-5 text-left md:px-6"
                    aria-expanded={on}
                    onClick={() => setOpen(on ? -1 : i)}
                  >
                    <span className="font-display text-[20px] leading-[1.25] text-bistre md:text-[24px]">
                      {item.q}
                    </span>
                    <span className={`faq-mark text-[22px] text-bistre ${on ? "is-open" : ""}`} aria-hidden>
                      +
                    </span>
                  </button>
                  <div className={`faq-panel ${on ? "is-open" : ""}`}>
                    <div className="faq-panel-inner">
                      <p className="border-t border-dashed hairline px-5 py-4 text-[16px] text-graphite md:px-6">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-dashed hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Reveal>
            <BrandLockup size={52} />
            <h2 className="font-display mt-6 max-w-[16ch] text-[36px] leading-[1.12] text-bistre md:text-[48px]">
              {t.closeCta}
            </h2>
            <p className="mt-4 max-w-[42ch] text-[18px] text-graphite">{t.closeBody}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={RELEASES} className="btn-hero">
                {t.getApp}
              </a>
              <Link to={{ pathname: "/docs/start", search: q }} className="btn-ghost btn-ghost-lg">
                {t.readDocs}
              </Link>
            </div>
            <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
              {t.footerHint}
            </p>
          </Reveal>
        </div>
      </section>

      <JumpSections items={jumps} locale={locale} />
    </main>
  );
}
