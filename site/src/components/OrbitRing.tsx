/**
 * Meridian ring. A slowly precessing wireframe torus lit like polished
 * metal, with a chartreuse specular band sweeping around it. Original
 * canvas renderer: the turning-metal-ring concept is a common landing
 * page motif; no third-party code or assets are used.
 */
import { useEffect, useRef } from "react";

const INK = "#1a1614";
const SWEEP = "#c9ce56";
const TAU = Math.PI * 2;
const R = 1; // major radius
const TUBE = 0.44; // tube radius
const MERIDIANS = 40; // rings around the tube (constant v)
const MERIDIAN_STEPS = 48;
const PARALLELS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]; // rings along the tube (constant u)
const PARALLEL_STEPS = 110;
const PERSPECTIVE = 3.4;
const TILT = 1.04; // base camera tilt
const SPIN = 0.16; // radians per second around the ring axis
const SWEEP_SPEED = 0.3;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function torusPoint(u: number, v: number): Vec3 {
  const ring = R + TUBE * Math.cos(v);
  return {
    x: ring * Math.cos(u),
    y: ring * Math.sin(u),
    z: TUBE * Math.sin(v),
  };
}

function torusNormal(u: number, v: number): Vec3 {
  const cv = Math.cos(v);
  return { x: cv * Math.cos(u), y: cv * Math.sin(u), z: Math.sin(v) };
}

function normalize(p: Vec3): Vec3 {
  const len = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / len, y: p.y / len, z: p.z / len };
}

// Light from the upper front-left; y points up in model space.
const LIGHT = normalize({ x: -0.5, y: 0.62, z: -0.6 });

function angDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
}

export function OrbitRing({ className = "" }: { className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrapEl = wrap.current;
    const canvasEl = canvas.current;
    if (!wrapEl || !canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    const target = { yaw: 0, pitch: 0 };
    const current = { yaw: 0, pitch: 0 };

    const resize = () => {
      const box = wrapEl.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.width;
      h = box.height;
      canvasEl.width = Math.max(1, Math.round(w * dpr));
      canvasEl.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapEl);

    const render = (timeMs: number) => {
      const t = timeMs / 1000;
      const spin = reduce ? 0.6 : t * SPIN;
      const tilt = TILT + (reduce ? 0 : Math.sin(t * 0.11) * 0.06);
      const yaw = spin + current.yaw;
      const pitch = tilt + current.pitch;
      const sweepU = (t * SWEEP_SPEED) % TAU;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * 0.325;

      // Precomputed rotation (yaw then pitch) as a single inline transform.
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const cpit = Math.cos(pitch);
      const spit = Math.sin(pitch);
      const rot = (p: Vec3): Vec3 => {
        const x1 = p.x * cyaw + p.z * syaw;
        const z1 = -p.x * syaw + p.z * cyaw;
        return { x: x1, y: p.y * cpit - z1 * spit, z: p.y * spit + z1 * cpit };
      };
      const view = (p: Vec3) => {
        const r = rot(p);
        const f = PERSPECTIVE / (PERSPECTIVE - r.z);
        return { x: cx + r.x * scale * f, y: cy - r.y * scale * f, z: r.z };
      };

      const strokeSegment = (
        u0: number,
        v0: number,
        u1: number,
        v1: number,
      ) => {
        const n = rot(torusNormal((u0 + u1) / 2, (v0 + v1) / 2));
        const shade = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
        const a = view(torusPoint(u0, v0));
        const b = view(torusPoint(u1, v1));
        const depth = 1 - (a.z + b.z) / 2 / 2.4; // far side fades back
        const fade = Math.max(0.16, Math.min(1, depth));
        const sweep = Math.exp(-((angDist((u0 + u1) / 2, sweepU) / 0.5) ** 2));

        ctx.lineWidth = 0.5 + shade * 0.9 + sweep * 0.6;
        if (sweep > 0.02) {
          ctx.strokeStyle = SWEEP;
          ctx.globalAlpha = sweep * fade * (0.3 + 0.7 * shade);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.strokeStyle = INK;
        ctx.globalAlpha = (0.08 + 0.72 * shade ** 1.6) * fade * (1 - sweep * 0.85);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };

      // Meridians: constant v, walk around the ring (u).
      for (let m = 0; m < MERIDIANS; m++) {
        const v = (m / MERIDIANS) * TAU;
        for (let s = 0; s < MERIDIAN_STEPS; s++) {
          const u0 = (s / MERIDIAN_STEPS) * TAU;
          const u1 = ((s + 1) / MERIDIAN_STEPS) * TAU;
          strokeSegment(u0, v, u1, v);
        }
      }
      // Parallels: constant u, walk around the tube (v).
      for (const u of PARALLELS) {
        for (let s = 0; s < PARALLEL_STEPS; s++) {
          const v0 = (s / PARALLEL_STEPS) * TAU;
          const v1 = ((s + 1) / PARALLEL_STEPS) * TAU;
          strokeSegment(u, v0, u, v1);
        }
      }

      // Hub: a quiet center point that anchors the ring.
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = (time: number) => {
      current.yaw += (target.yaw - current.yaw) * 0.06;
      current.pitch += (target.pitch - current.pitch) * 0.06;
      render(time);
      raf = requestAnimationFrame(loop);
    };

    if (reduce) {
      render(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onMove = (event: PointerEvent) => {
      if (reduce) return;
      const box = wrapEl.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      target.yaw = px * 0.16;
      target.pitch = py * 0.12;
    };
    const onLeave = () => {
      target.yaw = 0;
      target.pitch = 0;
    };
    wrapEl.addEventListener("pointermove", onMove);
    wrapEl.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrapEl.removeEventListener("pointermove", onMove);
      wrapEl.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <canvas
        ref={canvas}
        className="h-full w-full"
        role="img"
        aria-label="A wireframe metal ring slowly turning"
      />
    </div>
  );
}
