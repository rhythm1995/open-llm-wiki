import { useRef, useState } from "react";
import { gsap, scrollToId, ScrollTrigger, useGSAP } from "../lib/gsap";
import { copy, type Locale } from "../lib/locale";

export interface JumpItem {
  id: string;
  label: string;
}

export function JumpSections({
  items,
  locale,
}: {
  items: JumpItem[];
  locale: Locale;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(items[0]?.id ?? "");
  const ids = items.map((item) => item.id).join("|");

  useGSAP(
    () => {
      for (const item of items) {
        const trigger = document.getElementById(item.id);
        if (!trigger) continue;
        ScrollTrigger.create({
          trigger,
          start: "top 38%",
          end: "bottom 38%",
          onToggle: (self) => {
            if (self.isActive) setActive(item.id);
          },
        });
      }
    },
    { scope: root, dependencies: [ids] },
  );

  useGSAP(
    () => {
      if (!open) return;
      const menu = root.current?.querySelector(".jump-menu");
      if (!menu) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.fromTo(
        menu,
        { autoAlpha: 0, scale: 0.94, y: 10 },
        {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: reduce ? 0 : 0.26,
          ease: "power3.out",
        },
      );
    },
    { scope: root, dependencies: [open] },
  );

  return (
    <div ref={root} className="fixed bottom-5 right-4 z-40 md:bottom-8 md:right-7">
      <button
        type="button"
        className="nav-chip jump-trigger px-4 text-[12px] font-medium tracking-[-0.01em] text-bistre"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {copy[locale].jump}
      </button>
      <ul className={`jump-menu nav-chip ${open ? "is-open" : ""}`}>
        {items.map((item) => (
          <li key={item.id} className="w-full">
            <a
              href={`#${item.id}`}
              className={`block rounded-full px-3 py-1.5 text-[13px] ${
                active === item.id ? "text-bistre" : "text-graphite"
              }`}
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                scrollToId(item.id);
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
