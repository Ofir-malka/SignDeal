"use client";

/**
 * HeroCursorContext — single source of truth for hero cursor position.
 *
 * One section-level passive event listener drives all cursor-reactive
 * subsystems: card tilt, background grid glow, floating badges, glow layers.
 * Every consumer reads from the same MotionValues — guaranteed coherence,
 * no disconnected motion.
 *
 * ── Values ────────────────────────────────────────────────────────────────────
 * rawX / rawY      Normalised -0.5 → 0.5 relative to the section.
 *                  0 = centre. Used for tilt, parallax, halo offsets.
 * sectionX / Y     Pixel position relative to section top-left.
 *                  Used by background glows that need a CSS radial-gradient
 *                  at `Xpx Ypx` (cannot use a normalised value there).
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * 1. Wrap the <section> content:
 *      <HeroCursorProvider sectionRef={ref}>…</HeroCursorProvider>
 * 2. Consume in any child:
 *      const { rawX, rawY } = useHeroCursor();
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 * • One passive mousemove listener on the section element.
 * • All values are MotionValues — DOM updates bypass React render cycle.
 * • Zero useState on mouse move → zero React re-renders on move.
 */

import { createContext, useContext, useEffect, type RefObject } from "react";
import { useMotionValue, type MotionValue }                     from "motion/react";

// ── Context type ──────────────────────────────────────────────────────────────

export interface HeroCursorCtx {
  /** Normalised cursor X: -0.5 (far left) → 0 (centre) → 0.5 (far right). */
  rawX:     MotionValue<number>;
  /** Normalised cursor Y: -0.5 (top) → 0 (centre) → 0.5 (bottom). */
  rawY:     MotionValue<number>;
  /** Pixel X relative to section left edge. -9999 when no cursor. */
  sectionX: MotionValue<number>;
  /** Pixel Y relative to section top edge. -9999 when no cursor. */
  sectionY: MotionValue<number>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const HeroCursorCtx = createContext<HeroCursorCtx | null>(null);

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHeroCursor(): HeroCursorCtx {
  const ctx = useContext(HeroCursorCtx);
  if (!ctx) {
    throw new Error("useHeroCursor must be called inside <HeroCursorProvider>");
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function HeroCursorProvider({
  children,
  sectionRef,
}: {
  children:   React.ReactNode;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  // Start at centre / off-screen — safe defaults before any mouse event.
  const rawX     = useMotionValue(0);
  const rawY     = useMotionValue(0);
  const sectionX = useMotionValue(-9999);
  const sectionY = useMotionValue(-9999);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;
      rawX.set(px / rect.width  - 0.5);
      rawY.set(py / rect.height - 0.5);
      sectionX.set(px);
      sectionY.set(py);
    };

    const onLeave = () => {
      // Reset to neutral — springs decay back to zero for all consumers.
      rawX.set(0);
      rawY.set(0);
      sectionX.set(-9999);
      sectionY.set(-9999);
    };

    section.addEventListener("mousemove", onMove,  { passive: true });
    section.addEventListener("mouseleave", onLeave);
    return () => {
      section.removeEventListener("mousemove", onMove);
      section.removeEventListener("mouseleave", onLeave);
    };
  }, [rawX, rawY, sectionX, sectionY, sectionRef]);

  return (
    <HeroCursorCtx.Provider value={{ rawX, rawY, sectionX, sectionY }}>
      {children}
    </HeroCursorCtx.Provider>
  );
}
