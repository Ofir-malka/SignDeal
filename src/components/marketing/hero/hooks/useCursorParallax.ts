"use client";

/**
 * useCursorParallax — derives all card depth-engine values from the shared
 * HeroCursorContext (rawX / rawY), so every cursor-reactive subsystem in
 * the hero moves from a single source of truth.
 *
 * ── Spring philosophy ─────────────────────────────────────────────────────────
 * CARD  spring: stiffness 60 / damping 18 / mass 1.0
 *   → Very heavy. The card lags behind the cursor, then damps slowly to rest.
 *   → Feels like a dense physical object suspended in fluid.
 * INNER spring: stiffness 120 / damping 26 / mass 0.6
 *   → Slightly faster so internal content catches up before the card settles.
 *   → Creates the glass-surface layering illusion (VisionOS depth).
 * GLOW  spring: stiffness 80 / damping 20 / mass 0.8
 *   → Mid-weight — glow trails the cursor with a softer lag than the card.
 *
 * ── Outputs ───────────────────────────────────────────────────────────────────
 * rotateX / rotateY  — card 3D tilt (±15° / ±18°). 580 px perspective.
 * glowX   / glowY    — cursor glow offset inside card (±40 px).
 * innerX  / innerY   — inner-content counter-parallax (±6 px / ±4 px).
 *                      Opposite sign to cursor direction → glass surface illusion.
 * shadowX / shadowY  — dynamic drop shadow shift (px).
 * haloX   / haloY    — outer depth-halo counter-shift (±12 px / ±8 px).
 *
 * ── Unified cursor ────────────────────────────────────────────────────────────
 * rawX / rawY come from HeroCursorContext — a single section-level listener
 * shared by the grid glow, floating badges, and this hook. No duplication.
 */

import {
  useMotionValue,
  useTransform,
  useSpring,
  type MotionValue,
} from "motion/react";
import { useHeroCursor } from "@/components/marketing/hero/HeroCursorContext";

const CARD_SPRING  = { stiffness: 60,  damping: 18, mass: 1.0 } as const;
const INNER_SPRING = { stiffness: 120, damping: 26, mass: 0.6 } as const;
const GLOW_SPRING  = { stiffness: 80,  damping: 20, mass: 0.8 } as const;

export interface CursorParallax {
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  glowX:   MotionValue<number>;
  glowY:   MotionValue<number>;
  innerX:  MotionValue<number>;
  innerY:  MotionValue<number>;
  shadowX: MotionValue<number>;
  shadowY: MotionValue<number>;
  haloX:   MotionValue<number>;
  haloY:   MotionValue<number>;
}

export function useCursorParallax(): CursorParallax {
  // Single source of truth — section-level tracking from HeroCursorContext.
  const { rawX, rawY } = useHeroCursor();

  // ── Card tilt ──────────────────────────────────────────────────────────────
  const rotateXRaw = useTransform(rawY, [-0.5, 0.5], [15, -15]);
  const rotateYRaw = useTransform(rawX, [-0.5, 0.5], [-18, 18]);
  const rotateX    = useSpring(rotateXRaw, CARD_SPRING);
  const rotateY    = useSpring(rotateYRaw, CARD_SPRING);

  // ── Cursor glow inside card ────────────────────────────────────────────────
  const glowXRaw = useTransform(rawX, [-0.5, 0.5], [-40, 40]);
  const glowYRaw = useTransform(rawY, [-0.5, 0.5], [-40, 40]);
  const glowX    = useSpring(glowXRaw, GLOW_SPRING);
  const glowY    = useSpring(glowYRaw, GLOW_SPRING);

  // ── Inner content counter-parallax (glass surface illusion) ───────────────
  // Opposite sign: content drifts against cursor direction → depth cue.
  const innerXRaw = useTransform(rawX, [-0.5, 0.5], [6, -6]);
  const innerYRaw = useTransform(rawY, [-0.5, 0.5], [4, -4]);
  const innerX    = useSpring(innerXRaw, INNER_SPRING);
  const innerY    = useSpring(innerYRaw, INNER_SPRING);

  // ── Dynamic drop shadow ────────────────────────────────────────────────────
  const shadowXRaw = useTransform(rawX, [-0.5, 0.5], [16, -16]);
  const shadowYRaw = useTransform(rawY, [-0.5, 0.5], [8, 60]);
  const shadowX    = useSpring(shadowXRaw, GLOW_SPRING);
  const shadowY    = useSpring(shadowYRaw, GLOW_SPRING);

  // ── Outer halo counter-shift ───────────────────────────────────────────────
  const haloXRaw = useTransform(rawX, [-0.5, 0.5], [12, -12]);
  const haloYRaw = useTransform(rawY, [-0.5, 0.5], [8, -8]);
  const haloX    = useSpring(haloXRaw, GLOW_SPRING);
  const haloY    = useSpring(haloYRaw, GLOW_SPRING);

  return {
    rotateX, rotateY,
    glowX,   glowY,
    innerX,  innerY,
    shadowX, shadowY,
    haloX,   haloY,
  };
}
