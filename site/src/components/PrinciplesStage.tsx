import { Reveal } from "./Reveal";
import { copy, principles, type Locale } from "../lib/locale";

export function PrinciplesStage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const items = principles[locale];

  return (
    <section id="sit" className="bg-cream">
      <div className="mx-auto max-w-[1200px] px-6 py-[88px] md:py-[110px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
          {t.sitEyebrow}
        </p>
        <h2 className="font-display mt-3 text-[36px] leading-[1.1] tracking-[-0.021em] text-bistre md:text-[48px]">
          {t.sitTitle}
        </h2>
        <p className="mt-4 max-w-[42ch] text-[18px] text-graphite">{t.sitLead}</p>

        <ol className="mt-12 -mx-6 border-t border-dashed hairline">
          {items.map((item, i) => (
            <Reveal key={item.n} delay={i * 0.05}>
              <li className="rule-row -mx-6 border-b border-dashed hairline">
                <div className="rule-row-grid grid gap-x-8 gap-y-2 px-6 py-7 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,44ch)] md:items-baseline md:py-8">
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite md:pt-2">
                    {item.n} · {item.label}
                  </span>
                  <h3 className="rule-row-title font-display text-[26px] leading-[1.12] tracking-[-0.021em] text-bistre md:text-[30px]">
                    {item.title}
                  </h3>
                  <p className="rule-row-body text-[16px] leading-[1.55] text-graphite md:pt-1">
                    {item.body}
                  </p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
