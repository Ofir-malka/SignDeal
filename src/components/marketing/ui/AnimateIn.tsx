"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Direction = "bottom" | "left" | "right";

interface Props {
  children: ReactNode;
  /** Stagger delay in ms — desktop only, ignored on mobile */
  delay?: number;
  className?: string;
  /** Direction the element slides in from (default: bottom) */
  from?: Direction;
}

/**
 * Fade + slide-in wrapper driven by IntersectionObserver — DESKTOP ONLY.
 *
 * ── Mobile behaviour (< 768px width or coarse pointer) ───────────────────
 * All animation is skipped entirely. Content renders at full opacity on the
 * first paint and never transitions through a hidden state.
 *
 * Why skip on mobile:
 *  1. IntersectionObserver callbacks are throttled by iOS Safari during
 *     momentum scroll. Sections gated by opacity-0 stay blank for many
 *     frames while the user watches empty white space scroll past.
 *  2. translateX initial states can escape iOS Safari's overflow clipping
 *     on compositing-layer subtrees, incorrectly expanding the page width
 *     and triggering horizontal layout clipping on the hero.
 *  3. Mobile users benefit more from immediate content than scroll
 *     animations — content is the priority.
 *
 * ── Desktop behaviour ─────────────────────────────────────────────────────
 *  • If the element is already in the viewport on mount (above the fold):
 *    go straight to visible — no opacity-0 flash. getBoundingClientRect()
 *    is reliable on desktop at this point in the lifecycle.
 *  • If below the fold: apply hidden classes, then IO drives the reveal.
 *  • prefers-reduced-motion collapses all animation on desktop too.
 *
 * ── SSR / no-JS ──────────────────────────────────────────────────────────
 *  Content renders at full opacity before any JS runs. Animation classes are
 *  added only after the component hydrates — disabling JS never hides content.
 */

// Full class strings so Tailwind's static scanner keeps them in the bundle.
const HIDDEN: Record<Direction, string> = {
  bottom: "opacity-0 translate-y-6",
  left:   "opacity-0 -translate-x-8",
  right:  "opacity-0 translate-x-8",
};

const VISIBLE = "opacity-100 translate-y-0 translate-x-0";

type Phase = "ssr" | "skip" | "hidden" | "visible";

export function AnimateIn({ children, delay = 0, className = "", from = "bottom" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * phase state machine:
   *  "ssr"     — server render / pre-hydration. No animation classes.
   *              Content is naturally visible (allows SSR streaming / no-JS).
   *  "skip"    — mobile or reduced-motion. Jump straight to no-animation render.
   *              Content is immediately visible, no transitions, no IO.
   *  "hidden"  — desktop below-fold. Hidden classes applied while waiting for IO.
   *  "visible" — desktop in/above viewport. Visible classes applied, transition plays.
   */
  const [phase, setPhase] = useState<Phase>("ssr");

  useEffect(() => {
    // ── Detect skip conditions ─────────────────────────────────────────────
    const isMobileWidth   = window.innerWidth < 768;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const prefersNoMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isMobileWidth || isCoarsePointer || prefersNoMotion) {
      // Skip: render content immediately with no hidden state or IO.
      setPhase("skip");
      return;
    }

    // ── Desktop animated path ──────────────────────────────────────────────
    const el = ref.current;
    if (!el) return;

    // Check if the element is already in the viewport (above the fold).
    // getBoundingClientRect() is reliable on desktop during useEffect.
    // Going straight to "visible" means one render (ssr → visible) with no
    // intermediate hidden state, so no opacity-0 flash on above-fold content.
    const { top, bottom } = el.getBoundingClientRect();
    if (top < window.innerHeight && bottom > 0) {
      setPhase("visible");
      return; // IO not needed — element is already in view
    }

    // Below the fold: apply hidden state first, IO drives the reveal.
    setPhase("hidden");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase("visible");
          observer.disconnect(); // animate once only
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── SSR / mobile / reduced-motion path ──────────────────────────────────
  // Content renders at its natural opacity and position — no wrapper classes.
  if (phase === "ssr" || phase === "skip") {
    return (
      <div ref={ref} className={className || undefined}>
        {children}
      </div>
    );
  }

  // ── Desktop animated path ────────────────────────────────────────────────
  return (
    <div
      ref={ref}
      className={[
        "transition-all duration-700 ease-out",
        phase === "visible" ? VISIBLE : HIDDEN[from],
        className,
      ].filter(Boolean).join(" ")}
      style={{ transitionDelay: phase === "visible" ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
