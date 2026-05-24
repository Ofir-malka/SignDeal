"use client";

/**
 * useReducedMotionSafe — SSR-safe prefers-reduced-motion hook.
 *
 * motion/react's useReducedMotion() reads window.matchMedia on first render,
 * which throws during SSR and returns `null` during the server-render pass.
 * A `null` return can cause a hydration mismatch if the server and client
 * disagree about whether to animate.
 *
 * This wrapper:
 *   1. Returns `true` (motion disabled) during SSR and first hydration paint.
 *      → animations are off by default — safe for LCP / CLS stability.
 *   2. After mount, switches to the live matchMedia result from useReducedMotion().
 *      → if the user has no preference (most common), returns `false` (animate).
 *
 * Usage:
 *   const reduced = useReducedMotionSafe();
 *   if (reduced) return null; // or skip motion setup
 */

import { useEffect, useState }  from "react";
import { useReducedMotion }      from "motion/react";

export function useReducedMotionSafe(): boolean {
  // useReducedMotion returns `null` on server (matchMedia not available).
  // Treat null as `true` (disabled) to stay safe during SSR.
  const motionPref = useReducedMotion();

  // Server-safe initial state: assume reduced motion (true) until hydrated.
  const [safe, setSafe] = useState<boolean>(true);

  useEffect(() => {
    // After mount, use the real preference (null → false: animate).
    setSafe(motionPref === true);
  }, [motionPref]);

  return safe;
}
