"use client";

/**
 * LivingLedger — the hero's cinematic 3D dashboard card.
 *
 * ── Depth engine (Phase 1) ────────────────────────────────────────────────────
 * • 580 px perspective (tighter focal length → more dramatic tilt).
 * • Card tilt driven by shared HeroCursorContext (section-wide tracking).
 * • Dynamic multi-layer box-shadow via useMotionTemplate (zero re-renders).
 * • Cursor-reactive outer depth halo.
 * • Inner content counter-parallax (±6 / ±4 px) — VisionOS glass depth.
 *
 * ── Shadow system (cinematic) ─────────────────────────────────────────────────
 * Three-layer shadow stack per best-in-class fintech UI:
 *   1. Hard contact shadow   — 4 px blur, near-black. Grounds the card.
 *   2. Purple-tinted glow    — 80 px blur, violet 20 %. Premium ambient.
 *   3. Large soft ambient    — 120 px blur, near-black 88 %. Cinematic depth.
 * Dynamic cursor-reactive X/Y offset layered on top.
 *
 * ── Refractive edge (gradient border) ────────────────────────────────────────
 * Four independent 1 px rim-light divs replace the flat border:
 *   Top    — strongest (overhead key light), gradient white-to-transparent.
 *   Right  — medium (violet-tinted side bounce).
 *   Bottom — faint violet (ground bounce light).
 *   Left   — subtle catch-light.
 * Together they read as a glass edge catching ambient light from multiple
 * directions — a "refractive" effect without any actual CSS gradient border.
 *
 * ── Live infrastructure feel (Phase 2) ───────────────────────────────────────
 * • Animated film grain overlay (SVG feTurbulence, ~10 fps, 2.2 % opacity).
 * • Slow specular highlight wander (18 s cycle, 3 % opacity).
 * • Diagonal light sweep every 7 s + secondary reflection offset.
 *
 * ── Unified cursor (Phase 4) ─────────────────────────────────────────────────
 * Tilt responds across the full section width — no hover required on the card.
 * Same rawX / rawY values used by GridCursorGlow and FloatingBadges.
 */

import { useEffect, useState }                         from "react";
import { motion, useMotionTemplate, useTransform }     from "motion/react";
import { GlassCard }                                   from "@/components/marketing/ui/GlassCard";
import { useReducedMotionSafe }                        from "@/components/marketing/hero/hooks/useReducedMotionSafe";
import { useCursorParallax }                           from "@/components/marketing/hero/hooks/useCursorParallax";
import { useEventSimulator }                           from "@/components/marketing/hero/hooks/useEventSimulator";
import { TimelineEventFeed }                           from "@/components/marketing/hero/TimelineEventFeed";

// ── Grain texture ─────────────────────────────────────────────────────────────
const GRAIN_BG =
  "url(\"data:image/svg+xml," +
  "%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E" +
  "%3Cfilter id='f'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E" +
  "%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E" +
  "%3C/svg%3E" +
  "\")";

// ── Cursor glow inside the card ───────────────────────────────────────────────

function CursorGlow({
  glowX,
  glowY,
  active,
}: {
  glowX:  ReturnType<typeof useCursorParallax>["glowX"];
  glowY:  ReturnType<typeof useCursorParallax>["glowY"];
  active: boolean;
}) {
  const x = useTransform(glowX, v => v - 110);
  const y = useTransform(glowY, v => v - 110);
  if (!active) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="absolute pointer-events-none rounded-full w-[220px] h-[220px] blur-[60px]"
      style={{
        top:        "50%",
        left:       "50%",
        x,
        y,
        background: "radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, rgba(99,102,241,0.08) 50%, transparent 75%)",
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LivingLedger() {
  const reduced = useReducedMotionSafe();

  // Fine-pointer detection — tilt only active on desktop with mouse.
  const [tiltActive, setTiltActive] = useState(false);
  useEffect(() => {
    if (!reduced && window.matchMedia("(pointer: fine)").matches) {
      setTiltActive(true);
    }
  }, [reduced]);

  // All values sourced from useCursorParallax which reads HeroCursorContext —
  // no local mouse handlers needed here.
  const {
    rotateX, rotateY,
    glowX,   glowY,
    innerX,  innerY,
    shadowX, shadowY,
    haloX,   haloY,
  } = useCursorParallax();

  const { events, activeId } = useEventSimulator(reduced);

  // ── Multi-layer dynamic box shadow ────────────────────────────────────────
  // 1. cursor-reactive large ambient (shadowX/Y)
  // 2. static purple glow
  // 3. hard contact shadow
  // 4. ring border highlight
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 120px rgba(0,0,0,0.90), 0 0 80px rgba(139,92,246,0.22), 0 4px 8px rgba(0,0,0,0.85), 0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.07)`;

  return (
    <div
      className="relative max-sm:animate-none animate-[float_4s_ease-in-out_infinite]
                 max-sm:will-change-auto will-change-transform"
    >
      {/* ── Outer depth halo — counter-shifts with cursor ─────────────────── */}
      <motion.div
        aria-hidden="true"
        className="absolute pointer-events-none rounded-full blur-3xl"
        style={{
          inset:      "-48px",
          background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.07) 55%, transparent 80%)",
          x: tiltActive ? haloX : 0,
          y: tiltActive ? haloY : 0,
        }}
      />

      {/* Mid glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-3 rounded-[1.8rem] bg-indigo-500/[0.10] blur-2xl pointer-events-none"
      />

      {/* ── 3D perspective wrapper ─────────────────────────────────────────── */}
      <div style={{ perspective: tiltActive ? "580px" : undefined }}>
        <motion.div
          style={
            tiltActive
              ? { rotateX, rotateY, transformStyle: "preserve-3d", boxShadow }
              : {
                  boxShadow:
                    "0px 40px 120px rgba(0,0,0,0.88), 0 0 80px rgba(139,92,246,0.20), 0 4px 8px rgba(0,0,0,0.80), 0 24px 60px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.07)",
                }
          }
          className="relative rounded-2xl overflow-hidden
                     bg-indigo-950/92 backdrop-blur-xl
                     border border-white/[0.06]
                     transition-[border-color] duration-500
                     hover:border-white/[0.14]"
        >
          {/* Cursor glow (tracks mouse inside card) */}
          <CursorGlow glowX={glowX} glowY={glowY} active={tiltActive} />

          {/* ── Light sweep: diagonal highlight every 7 s ─────────────────── */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(108deg, " +
                "transparent         38%, " +
                "rgba(255,255,255,0.032) 50%, " +
                "transparent         62%)",
              animation: "hero-card-sweep 7s ease-in-out infinite",
            }}
          />

          {/* ── Secondary reflection (different angle, 11 s phase offset) ──── */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(125deg, " +
                "transparent         42%, " +
                "rgba(255,255,255,0.018) 50%, " +
                "transparent         58%)",
              animation: "hero-card-sweep 7s 11s ease-in-out infinite",
            }}
          />

          {/* ── Slow specular highlight wander ────────────────────────────── */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none z-10"
            style={{
              width:      "60%",
              height:     "50%",
              top:        "10%",
              left:       "10%",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.06) 0%, transparent 70%)",
              filter:     "blur(20px)",
              animation:  "hero-specular 18s ease-in-out infinite",
              opacity:    0.30,
            }}
          />

          {/* ── Refractive edge: 4-edge rim lights ───────────────────────── */}
          {/* Top — overhead key light, strongest + violet-tinted centre */}
          <div
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-px pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.28) 20%, rgba(200,180,255,0.22) 50%, rgba(255,255,255,0.18) 80%, transparent 100%)",
            }}
          />
          {/* Right — side bounce light, violet tint */}
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 bottom-0 w-px pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(to bottom, rgba(139,92,246,0.14) 0%, rgba(255,255,255,0.08) 40%, transparent 85%)",
            }}
          />
          {/* Bottom — faint violet ground bounce */}
          <div
            aria-hidden="true"
            className="absolute bottom-0 inset-x-0 h-px pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(to right, transparent 0%, rgba(139,92,246,0.12) 30%, rgba(99,102,241,0.09) 70%, transparent 100%)",
            }}
          />
          {/* Left — catch-light */}
          <div
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-0 w-px pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.12) 25%, rgba(255,255,255,0.08) 75%, transparent 100%)",
            }}
          />

          {/* ── Film grain texture ─────────────────────────────────────────── */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden z-30"
            style={{
              backgroundImage:    GRAIN_BG,
              backgroundRepeat:   "repeat",
              backgroundSize:     "150px 150px",
              opacity:            0.022,
              mixBlendMode:       "overlay",
              animation:          "hero-grain 0.8s steps(8) infinite",
            }}
          />

          {/* Browser chrome bar */}
          <div className="relative z-20 flex items-center gap-3 px-4 py-3 bg-white/[0.04] border-b border-white/[0.08]">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-400/60" />
              <div className="w-3 h-3 rounded-full bg-amber-400/60" />
              <div className="w-3 h-3 rounded-full bg-emerald-400/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div
                className="flex items-center gap-1.5
                           bg-white/[0.05] border border-white/[0.08]
                           rounded-md px-3 py-1 max-w-[185px] w-full"
              >
                <svg
                  width="8" height="8" viewBox="0 0 24 24" fill="none"
                  stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-[10px] text-indigo-400/70 font-mono tracking-tight truncate">
                  app.signdeal.co.il
                </span>
              </div>
            </div>
            <div className="w-[42px] shrink-0" />
          </div>

          {/* ── Inner content — counter-parallax (glass surface illusion) ──── */}
          <motion.div
            className="relative z-20 p-4 sm:p-5"
            style={tiltActive ? { x: innerX, y: innerY } : undefined}
          >
            <GlassCard variant="elevated" className="p-5 shadow-none">
              <div dir="rtl" className="space-y-4">

                {/* Card header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-md flex items-center justify-center">
                      <svg
                        width="12" height="12" viewBox="0 0 24 24"
                        fill="none" stroke="white" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-white text-xs font-semibold">SignDeal</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 font-medium">
                    פעיל ●
                  </span>
                </div>

                {/* Contract identity */}
                <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
                  <p className="text-white text-xs font-semibold">חוזה תיווך — יוסי כהן</p>
                  <p className="text-indigo-300/60 text-[11px] mt-0.5">
                    רוטשילד 15, תל אביב · עמלה ₪12,000
                  </p>
                </div>

                {/* Live event feed */}
                <TimelineEventFeed events={events} activeId={activeId} />

                {/* Footer */}
                <div className="pt-1 border-t border-white/10 flex items-center justify-between">
                  <button className="text-xs text-violet-400 font-medium flex items-center gap-1">
                    <svg
                      width="11" height="11" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="3"
                      strokeLinecap="round" aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    חוזה חדש
                  </button>
                  <span className="text-indigo-400/50 text-[11px]">31 דק׳ מחוזה לתשלום</span>
                </div>

              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
