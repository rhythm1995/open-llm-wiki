import { useEffect, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit?.target.id) setActive(hit.target.id);
      },
      { rootMargin: "-28% 0px -55% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [items.map((i) => i.id).join("|")]);

  return (
    <div className="fixed bottom-5 right-4 z-40 md:bottom-8 md:right-7">
      <button
        type="button"
        className="nav-glass rounded-full px-4 py-2 text-[11px] font-medium tracking-[-0.01em] text-bistre"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {copy[locale].jump}
      </button>
      {open ? (
        <ul className="nav-glass mt-2 min-w-[180px] overflow-hidden rounded-2xl py-2">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block px-4 py-1.5 text-[13px] ${
                  active === item.id ? "text-bistre" : "text-graphite"
                }`}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
