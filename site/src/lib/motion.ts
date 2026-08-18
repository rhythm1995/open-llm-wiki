import { useReducedMotion, type Transition } from "motion/react";

export const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const easeUi: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const enterTransition: Transition = {
  duration: 0.68,
  ease: easeOutExpo,
};

export const uiTransition: Transition = {
  duration: 0.22,
  ease: easeUi,
};

export function useMotionSafe() {
  const reduce = useReducedMotion();
  return !reduce;
}

export const revealHidden = { opacity: 0, y: 28 };
export const revealShow = { opacity: 1, y: 0 };
