import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { JumpSections } from "../components/JumpSections";
import { Lattice } from "../components/Lattice";
import { Reveal } from "../components/Reveal";
import { DOC_PAGES } from "../lib/docs";
import { copy, faqs, type Locale } from "../lib/locale";
import { easeOutExpo, enterTransition, uiTransition } from "../lib/motion";
import { localizeShotFile } from "../lib/shots";

const RELEASES = "https://github.com/rhythm1995/open-llm-wiki/releases";
const media = (name: string, locale: Locale) =>
  `${import.meta.env.BASE_URL}docs-media/${localizeShotFile(name, locale)}`;

export function Home({ locale }: { locale: Locale }) {
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

  return (
    <main>
      <section
        id="hero"
        className="mx-auto grid min-h-[100dvh] max-w-[1200px] items-center gap-10 px-6 pb-20 pt-28 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-8 md:pt-24"
      >
        <div>
          <motion.p
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: 0.05 }}
          >
            {t.heroEyebrow}
          </motion.p>
          <motion.h1
            className="font-display mt-5 max-w-[12ch] text-[48px] leading-[1.04] tracking-[-0.037em] text-bistre md:text-[54px]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: 0.12 }}
          >
            {t.heroTitle}
          </motion.h1>
          <motion.p
            className="mt-5 max-w-[34ch] text-[18px] leading-[1.5] text-graphite md:text-[20px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: 0.2 }}
          >
            {t.heroSub}
          </motion.p>
          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterTransition, delay: 0.28 }}
          >
            <a href={RELEASES} className="btn-pill">
              {t.getApp}
            </a>
            <Link to={{ pathname: "/docs/start", search: q }} className="btn-ghost">
              {t.readDocs}
            </Link>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.18, ease: easeOutExpo }}
        >
          <Lattice className="mx-auto aspect-square w-full max-w-[520px]" />
        </motion.div>
      </section>

      <section id="essay" className="border-t border-dashed hairline">
        <div className="mx-auto max-w-[760px] px-6 py-[100px] md:py-[120px]">
          <Reveal>
            <blockquote className="mb-14">
              <span className="font-display block text-[56px] leading-none text-bistre">
                “
              </span>
              <p className="font-display -mt-4 text-[28px] leading-[1.2] tracking-[-0.021em] text-bistre md:text-[36px]">
                {t.quote}
              </p>
              <p className="mt-5 text-[14px] text-bistre">
                {t.quoteBy}
                <span className="text-graphite"> / {t.quoteRole}</span>
              </p>
            </blockquote>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="drop-cap text-[16px] leading-[1.6] text-bistre">{t.essayP1}</p>
            <p className="mt-5 text-[16px] leading-[1.6] text-graphite">{t.essayP2}</p>
          </Reveal>
        </div>
      </section>

      <section id="sit" className="bg-cream">
        <div className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
              {t.sitEyebrow}
            </p>
            <h2 className="font-display mt-3 max-w-[16ch] text-[36px] leading-[1.1] tracking-[-0.021em] text-bistre md:text-[48px]">
              {t.sitTitle}
            </h2>
            <p className="mt-4 max-w-[46ch] text-[18px] text-graphite md:text-[20px]">
              {t.sitLead}
            </p>
          </Reveal>
          <div className="mt-16 grid gap-px md:grid-cols-3">
            {[
              [t.pillar1Label, t.pillar1Title, t.pillar1Body],
              [t.pillar2Label, t.pillar2Title, t.pillar2Body],
              [t.pillar3Label, t.pillar3Title, t.pillar3Body],
            ].map(([label, title, body], i) => (
              <Reveal key={label} delay={i * 0.08} className="border-t border-dashed hairline pt-6 md:border-t-0 md:pt-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                  {label}
                </p>
                <h3 className="font-display mt-3 text-[24px] leading-[1.2] text-bistre">
                  {title}
                </h3>
                <p className="mt-3 text-[16px] leading-[1.55] text-graphite">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="surfaces">
        <div className="mx-auto max-w-[1200px] px-6 py-[100px] md:py-[120px]">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
              {t.surfacesEyebrow}
            </p>
            <h2 className="font-display mt-3 text-[36px] leading-[1.1] tracking-[-0.021em] text-bistre md:text-[48px]">
              {t.surfacesTitle}
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <figure className="mt-12 overflow-hidden">
              <img src={media("editor.png", locale)} alt={t.editorCap} className="shot w-full" />
              <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                {t.editorCap}
              </figcaption>
            </figure>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <Reveal delay={0.04}>
              <figure>
                <img src={media("graph.png", locale)} alt={t.graphCap} className="shot w-full" />
                <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                  {t.graphCap}
                </figcaption>
              </figure>
            </Reveal>
            <Reveal delay={0.1}>
              <figure>
                <img src={media("health.png", locale)} alt={t.healthCap} className="shot w-full" />
                <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                  {t.healthCap}
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>
      </section>

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
                <Reveal key={item.q} delay={i * 0.03}>
                  <div className="border border-dashed hairline bg-cream">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left md:px-6"
                      aria-expanded={on}
                      onClick={() => setOpen(on ? -1 : i)}
                    >
                      <span className="font-display text-[20px] leading-[1.25] text-bistre md:text-[24px]">
                        {item.q}
                      </span>
                      <motion.span
                        className="text-[22px] text-bistre"
                        animate={{ rotate: on ? 45 : 0 }}
                        transition={uiTransition}
                        aria-hidden
                      >
                        +
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {on ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={uiTransition}
                          className="overflow-hidden"
                        >
                          <p className="border-t border-dashed hairline px-5 py-4 text-[16px] text-graphite md:px-6">
                            {item.a}
                          </p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-dashed hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <Reveal>
            <h2 className="font-display text-[36px] leading-[1.1] text-bistre md:text-[48px]">
              {t.closeCta}
            </h2>
            <p className="mt-4 max-w-[42ch] text-[18px] text-graphite">{t.closeBody}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={RELEASES} className="btn-pill">
                {t.getApp}
              </a>
              <Link to={{ pathname: "/docs/start", search: q }} className="btn-ghost">
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
