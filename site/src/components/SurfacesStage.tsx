import { useRef } from "react";
import { gsap, refreshWhenImagesSettle, useGSAP } from "../lib/gsap";
import { copy, type Locale } from "../lib/locale";
import { localizeShotFile } from "../lib/shots";

const SHOTS = [
  { file: "editor.png", cap: "editorCap" },
  { file: "graph.png", cap: "graphCap" },
  { file: "health.png", cap: "healthCap" },
  { file: "agent.png", cap: "agentCap" },
] as const;

const media = (name: string, locale: Locale) =>
  `${import.meta.env.BASE_URL}docs-media/${localizeShotFile(name, locale)}`;

export function SurfacesStage({ locale }: { locale: Locale }) {
  const root = useRef<HTMLElement>(null);
  const t = copy[locale];

  useGSAP(
    () => {
      const pin = root.current?.querySelector<HTMLElement>(".surfaces-pin");
      const track = root.current?.querySelector<HTMLElement>(".surfaces-track");
      if (!pin || !track) return;

      refreshWhenImagesSettle(root.current);

      const mm = gsap.matchMedia();
      mm.add(
        "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
        () => {
          const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 48);
          gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: pin,
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
            },
          });
        },
      );
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".surface-head", {
          autoAlpha: 0,
          y: 16,
          duration: 0.45,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 86%", once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [locale], revertOnUpdate: true },
  );

  return (
    <section id="surfaces" ref={root}>
      <div className="surfaces-pin overflow-hidden">
        <div className="surface-head mx-auto max-w-[1200px] px-6 pt-[100px] md:pt-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-graphite">
            {t.surfacesEyebrow}
          </p>
          <h2 className="font-display mt-3 text-[36px] leading-[1.1] tracking-[-0.021em] text-bistre md:text-[48px]">
            {t.surfacesTitle}
          </h2>
        </div>
        <div className="surfaces-track mt-12 flex w-max flex-col gap-8 px-6 pb-[100px] md:mt-10 md:h-[68vh] md:flex-row md:items-center md:gap-10 md:pb-16">
          {SHOTS.map((shot) => (
            <figure
              key={shot.file}
              className="w-[min(88vw,920px)] shrink-0"
            >
              <img
                src={media(shot.file, locale)}
                alt={t[shot.cap]}
                className="shot w-full"
              />
              <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                {t[shot.cap]}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
