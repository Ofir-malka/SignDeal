"use client";

/**
 * FloatingBadges — holographic depth-field status chips.
 *
 * Phase 4 (unified physics) additions:
 *   • Cursor-reactive parallax — each badge shifts with the section cursor at
 *     a strength proportional to its depth layer.
 *     Near (foreground): ±8 px — closest to viewer, moves most.
 *     Mid:               ±5 px.
 *     Far (background):  ±3 px — farthest, moves least.
 *     All use BADGE_SPRING for a slightly snappier feel than the card (they're
 *     lighter objects floating in the same physics field).
 *   • Glow opacity ceiling reduced from 0.80 → 0.55 in globals.css (Phase 3).
 *   • Opacity floor raised: far badges are more visible (0.72 → 0.82).
 *
 * ── Phase 1 / 2 features retained ────────────────────────────────────────────
 * • 2D oval drift paths (X+Y) — unique trajectory per badge.
 * • Glow breathing — GPU-composited opacity pulse (opacity only, no repaint).
 * • Scale breathing embedded in drift keyframe.
 * • Depth layering: near/mid/far z-index + opacity + blur.
 * • All animation CSS — no JS timer, no requestAnimationFrame.
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 * Motion springs are MotionValues — zero React re-renders on mouse move.
 * Hidden on mobile (lg:flex) — no compositing on touch devices.
 */

import { motion, useSpring, useTransform } from "motion/react";
import { useHeroCursor }                   from "@/components/marketing/hero/HeroCursorContext";

// ── Badge definitions ─────────────────────────────────────────────────────────

interface BadgeDef {
  label:      string;
  dot:        string;
  color:      string;
  glowColor:  string;
  cls:        string;
  depth:      "near" | "mid" | "far";
  driftAnim:  string;
  glowDelay:  string;
}

const BADGES: BadgeDef[] = [
  {
    label:     "לקוח חתם עכשיו",
    dot:       "bg-emerald-400",
    color:     "text-emerald-300",
    glowColor: "rgba(52,211,153,0.38)",
    cls:       "-right-4 lg:-right-10 top-8",
    depth:     "near",
    driftAnim: "hero-badge-drift-a 7s ease-in-out infinite",
    glowDelay: "0s",
  },
  {
    label:     "₪12,000 התקבל",
    dot:       "bg-violet-400",
    color:     "text-violet-300",
    glowColor: "rgba(167,139,250,0.38)",
    cls:       "-right-6 lg:-right-12 bottom-20",
    depth:     "mid",
    driftAnim: "hero-badge-drift-b 9s 1.8s ease-in-out infinite",
    glowDelay: "1.4s",
  },
  {
    label:     "SMS נפתח",
    dot:       "bg-blue-400",
    color:     "text-blue-300",
    glowColor: "rgba(96,165,250,0.30)",
    cls:       "left-3 -top-4",
    depth:     "far",
    driftAnim: "hero-badge-drift-c 6s 3.5s ease-in-out infinite",
    glowDelay: "2.8s",
  },
] as const;

// ── Depth visual modifiers ────────────────────────────────────────────────────

const DEPTH_Z: Record<BadgeDef["depth"], string> = {
  near: "z-20",
  mid:  "z-10",
  far:  "z-0",
};

const DEPTH_OPACITY: Record<BadgeDef["depth"], number> = {
  near: 1,
  mid:  0.94,
  far:  0.82,
};

const DEPTH_FILTER: Record<BadgeDef["depth"], string | undefined> = {
  near: undefined,
  mid:  "blur(0.3px)",
  far:  "blur(0.7px)",
};

// Parallax strength per depth — near objects shift more (foreground parallax).
const DEPTH_PX_RANGE: Record<BadgeDef["depth"], number> = {
  near: 8,
  mid:  5,
  far:  3,
};

const BADGE_SPRING = { stiffness: 90, damping: 22, mass: 0.7 } as const;

// ── Single badge with cursor parallax ────────────────────────────────────────

function Badge({ badge }: { badge: BadgeDef }) {
  const { label, dot, color, glowColor, cls, depth, driftAnim, glowDelay } = badge;
  const range  = DEPTH_PX_RANGE[depth];

  const { rawX, rawY } = useHeroCursor();

  const bxRaw = useTransform(rawX, [-0.5, 0.5], [-range, range]);
  const byRaw = useTransform(rawY, [-0.5, 0.5], [-range * 0.6, range * 0.6]);
  const bx    = useSpring(bxRaw, BADGE_SPRING);
  const by    = useSpring(byRaw, BADGE_SPRING);

  return (
    <motion.div
      key={label}
      aria-hidden="true"
      className={[
        "hidden lg:flex items-center gap-2 absolute",
        "bg-indigo-950/88 border border-white/[0.18] backdrop-blur-xl",
        "rounded-xl px-3.5 py-2.5",
        "shadow-[0_8px_32px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.08)_inset]",
        "text-xs font-semibold",
        color,
        cls,
        DEPTH_Z[depth],
      ].join(" ")}
      style={{
        animation: driftAnim,
        opacity:   DEPTH_OPACITY[depth],
        x:         bx,
        y:         by,
        ...(DEPTH_FILTER[depth] ? { filter: DEPTH_FILTER[depth] } : {}),
      }}
    >
      {/* Glow breathing overlay */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background:      `radial-gradient(ellipse at center, ${glowColor} 0%, transparent 70%)`,
          animation:       "hero-badge-glow 4.5s ease-in-out infinite",
          animationDelay:  glowDelay,
          zIndex:          -1,
        }}
      />

      {/* Pulse dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${dot}`} />

      {/* Label */}
      {label}
    </motion.div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FloatingBadges() {
  return (
    <>
      {BADGES.map(badge => (
        <Badge key={badge.label} badge={badge} />
      ))}
    </>
  );
}
