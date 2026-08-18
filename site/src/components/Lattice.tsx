/**
 * Insight lattice. Original dandelion: seeded polar nodes, not copied
 * from any third-party SVG. Motion is transform/opacity/stroke only.
 */
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useMemo, type PointerEvent } from "react";
import { easeOutExpo } from "../lib/motion";

const COLORS = ["#1a1614", "#e2e67d", "#f59e3a", "#9a9d3e"] as const;
const CX = 200;
const CY = 200;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNodes() {
  const rand = mulberry32(20260818);
  const nodes: { x: number; y: number; r: number; fill: string; delay: number }[] = [];
  for (let i = 0; i < 52; i++) {
    const ring = 0.22 + rand() * 0.72;
    const angle = rand() * Math.PI * 2;
    const jitter = 8 + rand() * 18;
    const dist = 36 + ring * 148 + (rand() - 0.5) * jitter;
    nodes.push({
      x: CX + Math.cos(angle) * dist,
      y: CY + Math.sin(angle) * dist,
      r: 1.6 + rand() * 3.4,
      fill: COLORS[Math.floor(rand() * COLORS.length)] ?? COLORS[0],
      delay: 0.08 + rand() * 0.55,
    });
  }
  return nodes;
}

export function Lattice({ className = "" }: { className?: string }) {
  const nodes = useMemo(buildNodes, []);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 70, damping: 18, mass: 0.4 });
  const sy = useSpring(my, { stiffness: 70, damping: 18, mass: 0.4 });
  const shiftX = useTransform(sx, [-1, 1], [-10, 10]);
  const shiftY = useTransform(sy, [-1, 1], [-8, 8]);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const box = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - box.left) / box.width) * 2 - 1);
    my.set(((e.clientY - box.top) / box.height) * 2 - 1);
  }

  function onLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <div
      className={`relative ${className}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <motion.svg
        viewBox="0 0 400 400"
        role="img"
        aria-label="Notes radiating from a single hub"
        style={reduce ? undefined : { x: shiftX, y: shiftY }}
        className="h-full w-full overflow-visible"
      >
        {nodes.map((n, i) => (
          <motion.path
            key={`l-${i}`}
            d={`M ${CX} ${CY} L ${n.x} ${n.y}`}
            stroke="#a8a7a1"
            strokeWidth="0.45"
            fill="none"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={{ duration: 0.9, delay: n.delay * 0.45, ease: easeOutExpo }}
          />
        ))}
        <motion.circle
          cx={CX}
          cy={CY}
          r="8"
          fill="#1a1614"
          animate={reduce ? undefined : { scale: [1, 1.14, 1] }}
          transition={
            reduce
              ? undefined
              : { duration: 2.8, repeat: Infinity, ease: easeOutExpo }
          }
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        {nodes.map((n, i) => (
          <motion.circle
            key={`n-${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.fill}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={
              reduce
                ? { opacity: 1, scale: 1 }
                : { opacity: [1, 0.72, 1], scale: 1 }
            }
            transition={
              reduce
                ? undefined
                : {
                    opacity: {
                      duration: 3.6 + (i % 5) * 0.35,
                      delay: n.delay + 0.4,
                      repeat: Infinity,
                      ease: easeOutExpo,
                    },
                    scale: { duration: 0.5, delay: n.delay, ease: easeOutExpo },
                  }
            }
          />
        ))}
      </motion.svg>
    </div>
  );
}
