import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(
  useGSAP,
  ScrollTrigger,
  ScrollToPlugin,
  SplitText,
  DrawSVGPlugin,
);

gsap.defaults({ ease: "power3.out", duration: 0.45 });

export { DrawSVGPlugin, gsap, ScrollTrigger, SplitText, useGSAP };

export function scrollToId(id: string) {
  gsap.to(window, {
    duration: 0.55,
    ease: "power3.out",
    scrollTo: { y: `#${CSS.escape(id)}`, offsetY: 84, autoKill: true },
  });
}

export function refreshWhenImagesSettle(root: ParentNode | null) {
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll("img"));
  const pending = imgs.filter((img) => !img.complete);
  if (!pending.length) {
    ScrollTrigger.refresh();
    return;
  }
  let left = pending.length;
  const done = () => {
    left -= 1;
    if (left <= 0) ScrollTrigger.refresh();
  };
  for (const img of pending) {
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }
}
