import { motion } from "motion/react";
import type { ReactNode } from "react";
import { enterTransition, revealHidden, revealShow, useMotionSafe } from "../lib/motion";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const live = useMotionSafe();
  return (
    <motion.div
      className={className}
      initial={live ? revealHidden : false}
      whileInView={revealShow}
      viewport={{ once: true, amount: 0.24 }}
      transition={{ ...enterTransition, delay }}
    >
      {children}
    </motion.div>
  );
}
