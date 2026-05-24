"use client";

/**
 * BackgroundGlowSystem — volumetric background energy + micro-particle field.
 *
 * Phase 2 additions over Phase 1:
 *   • GridCursorGlow — cursor-reactive radial illumination on the grid layer.
 *     Makes the infrastructure feel reactive to the user's presence.
 *   • Micro-particle field — 8 tiny light specks (1–2.5 px) drifting on
 *     independent paths. Extremely low opacity (2–4 %). Luxury, not gaming.
 *     Colors: white and very faint violet only. No neon.
 *
 * ── Micro-particle design principles ─────────────────────────────────────────
 * • 1–2.5 px dots — sub-pixel scale keeps them subliminal.
 * • Opacity: 2–4 % — noticed only subconsciously ("the system is processing").
 * • Cycle durations: 17–32 s — never read as a visible loop.
 * • 3 path keyframe variants (a/b/c) so particles have distinct trajectories.
 * • White / near-white only — no colored neon, stays in luxury fintech palette.
 * • max-sm:hidden — mobile saves the compositing layer cost.
 *
 * ── Layer order (bottom → top) ────────────────────────────────────────────────
 * 1.  Grid texture overlay
 * 2.  GridCursorGlow (cursor-reactive grid illumination)     [NEW]
 * 3.  Central violet glow (slow breathe)
 * 4.  Top-right accent glow (offset phase)
 * 5.  Left ambient glow (static, behind mock card)
 * 6.  Aurora blob A — large violet, slow NW/SE path
 * 7.  Aurora blob B — indigo, NE/SW, longer cycle
 * 8.  Aurora blob C — faint lower anchor
 * 9.  Micro-particle field                                   [NEW]
 * 10. Network energy SVG lines
 * 11. Bottom cinematic vignette
 * 12. Bottom section blend (floor)
 */

import { GridCursorGlow } from "@/components/marketing/hero/GridCursorGlow";

// ── Micro-particle definitions ────────────────────────────────────────────────

interface Particle {
  x:       string;
  y:       string;
  size:    number;   // px
  opacity: number;   // element-level (very low)
  anim:    string;   // animation shorthand
  color:   string;   // CSS color
}

const PARTICLES: Particle[] = [
  { x: "13%", y: "28%", size: 2.0, opacity: 0.040, anim: "hero-particle-a 22s  0s ease-in-out infinite", color: "rgba(255,255,255,0.9)" },
  { x: "68%", y: "16%", size: 1.5, opacity: 0.030, anim: "hero-particle-b 28s  5s ease-in-out infinite", color: "rgba(255,255,255,0.9)" },
  { x: "36%", y: "74%", size: 2.0, opacity: 0.028, anim: "hero-particle-c 19s  2s ease-in-out infinite", color: "rgba(255,255,255,0.9)" },
  { x: "84%", y: "44%", size: 1.0, opacity: 0.025, anim: "hero-particle-a 25s  8s ease-in-out infinite", color: "rgba(167,139,250,0.8)" },
  { x: "49%", y: "87%", size: 1.5, opacity: 0.022, anim: "hero-particle-b 32s 12s ease-in-out infinite", color: "rgba(255,255,255,0.9)" },
  { x: "76%", y: "61%", size: 2.0, opacity: 0.035, anim: "hero-particle-c 17s  6s ease-in-out infinite", color: "rgba(167,139,250,0.7)" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function BackgroundGlowSystem() {
  return (
    <>
      {/* ── Layer 1: Grid texture ──────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="max-sm:hidden absolute inset-0 pointer-events-none select-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), " +
            "linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)",
        }}
      />

      {/* ── Layer 2: Cursor-reactive grid illumination ─────────────────────── */}
      <GridCursorGlow />

      {/* ── Layer 3: Central violet glow ──────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
      >
        <div
          className="w-[700px] h-[700px] bg-violet-600/20 rounded-full blur-3xl
                     max-sm:animate-none animate-[hero-glow-breathe_13s_ease-in-out_infinite]"
        />
      </div>

      {/* ── Layer 4: Top-right accent glow ────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="max-sm:hidden absolute -top-24 right-0 w-[480px] h-[480px]
                   bg-violet-500/[0.09] rounded-full blur-3xl pointer-events-none select-none"
        style={{ animation: "hero-glow-breathe 12s 3.5s ease-in-out infinite" }}
      />

      {/* ── Layer 5: Left ambient glow (behind mock card) ─────────────────── */}
      <div
        aria-hidden="true"
        className="max-sm:hidden absolute pointer-events-none select-none
                   top-[18%] left-[6%] w-[380px] h-[420px]
                   rounded-full blur-[90px]"
        style={{
          background:
            "radial-gradient(ellipse at center, " +
            "rgba(99,102,241,0.10) 0%, " +
            "rgba(79,70,229,0.05) 45%, " +
            "transparent 75%)",
        }}
      />

      {/* ── Layer 6: Aurora blob A — violet, NW drift, 25 s ───────────────── */}
      <div
        aria-hidden="true"
        className="max-sm:hidden absolute pointer-events-none select-none rounded-full blur-[110px]"
        style={{
          width:      "620px",
          height:     "420px",
          top:        "22%",
          left:       "18%",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.10) 0%, rgba(99,102,241,0.04) 55%, transparent 80%)",
          animation:  "hero-aurora-a 25s ease-in-out infinite",
        }}
      />

      {/* ── Layer 7: Aurora blob B — indigo, NE drift, 34 s (6 s offset) ─── */}
      <div
        aria-hidden="true"
        className="max-sm:hidden absolute pointer-events-none select-none rounded-full blur-[90px]"
        style={{
          width:      "520px",
          height:     "360px",
          top:        "38%",
          right:      "8%",
          background: "radial-gradient(ellipse, rgba(79,70,229,0.07) 0%, rgba(67,56,202,0.03) 60%, transparent 80%)",
          animation:  "hero-aurora-b 34s 6s ease-in-out infinite",
        }}
      />

      {/* ── Layer 8: Aurora blob C — faint lower anchor, 20 s (11 s offset) ─ */}
      <div
        aria-hidden="true"
        className="max-sm:hidden absolute pointer-events-none select-none rounded-full blur-[100px]"
        style={{
          width:      "400px",
          height:     "300px",
          bottom:     "10%",
          left:       "5%",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.05) 0%, transparent 70%)",
          animation:  "hero-aurora-c 20s 11s ease-in-out infinite",
        }}
      />

      {/* ── Layer 9: Micro-particle field ─────────────────────────────────── */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="max-sm:hidden absolute pointer-events-none select-none rounded-full"
          style={{
            left:      p.x,
            top:       p.y,
            width:     `${p.size}px`,
            height:    `${p.size}px`,
            background: p.color,
            opacity:   p.opacity,
            animation: p.anim,
          }}
        />
      ))}

      {/* ── Layer 10: Network energy SVG lines ────────────────────────────── */}
      <svg
        aria-hidden="true"
        className="max-sm:hidden absolute inset-0 w-full h-full pointer-events-none select-none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.018 }}
      >
        <line
          x1="0" y1="30%" x2="100%" y2="70%"
          stroke="white" strokeWidth="1"
          strokeDasharray="6 40"
          style={{ animation: "hero-network-dash 8s linear infinite" }}
        />
        <line
          x1="0" y1="60%" x2="100%" y2="20%"
          stroke="white" strokeWidth="0.75"
          strokeDasharray="4 60"
          style={{ animation: "hero-network-dash 11s 2s linear infinite" }}
        />
        <line
          x1="20%" y1="0" x2="80%" y2="100%"
          stroke="rgba(139,92,246,1)" strokeWidth="1"
          strokeDasharray="5 50"
          style={{ animation: "hero-network-dash 9s 4s linear infinite" }}
        />
      </svg>

      {/* ── Layer 11: Bottom cinematic vignette ───────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[220px] pointer-events-none select-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(15,12,41,0.55) 100%)",
        }}
      />

      {/* ── Layer 12: Hard section floor blend ────────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-32
                   bg-gradient-to-b from-transparent to-indigo-950
                   pointer-events-none select-none"
      />
    </>
  );
}
