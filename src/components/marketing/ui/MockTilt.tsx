"use client";

/**
 * MockTilt — adds a very subtle 3D perspective tilt to the hero dashboard mock.
 *
 * ── Behaviour ─────────────────────────────────────────────────────────────────
 * • Fine-pointer (mouse) devices only — checked via matchMedia after hydration.
 *   Touch/coarse devices get a plain pass-through wrapper (no tilt, no extra DOM).
 * • prefers-reduced-motion: useReducedMotion() → plain pass-through.
 * • The wrapper is always rendered as div > motion.div to avoid remounting
 *   children when the "ready" flag flips after hydration. React reconciles the
 *   children in-place (no CSS animation restart, no flash of unstyled content).
 *
 * ── Tilt values ───────────────────────────────────────────────────────────────
 * rotateX -1.5°, rotateY 2.5°, scale 1.01 — deliberately small.
 * At 900px perspective this reads as a very gentle lean without distortion.
 * Spring stiffness 160 / damping 22 gives a smooth, luxury feel with a subtle
 * settle rather than a hard snap.
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 * transform (rotateX/Y/scale) is GPU composited — no layout, no paint.
 * The perspective wrapper div has no dimensions / layout impact.
 * max-sm:animate-none on DashboardMock's float animation is unaffected.
 */

import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function MockTilt({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  // Start false: safe default for SSR + first hydration paint (no mismatch).
  // Flips true only on fine-pointer devices after mount — activates the tilt.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only enable on real mouse devices — skip touch / stylus / coarse pointers.
    if (!reduced && window.matchMedia("(pointer: fine)").matches) {
      setReady(true);
    }
  }, [reduced]);

  // Always render the same element structure so children are never remounted.
  // The whileHover prop changes from undefined → active after hydration, which
  // React handles as a prop update on the existing DOM node.
  return (
    <div style={{ perspective: ready ? "900px" : undefined }}>
      <motion.div
        whileHover={
          ready
            ? { rotateX: -1.5, rotateY: 2.5, scale: 1.01 }
            : undefined
        }
        transition={{ type: "spring", stiffness: 160, damping: 22, mass: 0.8 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
