"use client";

/**
 * GridCursorGlow — cursor-reactive radial illumination over the hero grid.
 *
 * Reads sectionX / sectionY from HeroCursorContext — the same single
 * section-level listener that drives card tilt and badge drift.
 * No separate event listener here.
 *
 * Gradient: 320 px circle, violet at 7.5 % opacity fading to transparent.
 * Hidden on mobile (max-sm:hidden) — touch devices have no cursor.
 */

import { motion, useMotionTemplate } from "motion/react";
import { useHeroCursor }             from "@/components/marketing/hero/HeroCursorContext";

export function GridCursorGlow() {
  const { sectionX, sectionY } = useHeroCursor();

  // Build a radial-gradient string that updates directly on the DOM
  // via MotionTemplate — zero React re-renders.
  const background = useMotionTemplate`radial-gradient(320px circle at ${sectionX}px ${sectionY}px, rgba(139,92,246,0.075) 0%, transparent 65%)`;

  return (
    <motion.div
      aria-hidden="true"
      className="max-sm:hidden absolute inset-0 pointer-events-none select-none"
      style={{ background }}
    />
  );
}
