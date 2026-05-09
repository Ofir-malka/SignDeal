"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Direction = "bottom" | "left" | "right";

interface Props {
  children: ReactNode;
  /** Stagger delay in ms — applied only when element becomes visible */
  delay?: number;
  className?: string;
  /** Direction the element slides in from (default: bottom) */
  from?: Direction;
}

/**
 * Fade + slide-in wrapper driven by IntersectionObserver.
 * Zero external dependencies — pure CSS transitions + a single ref.
 *
 * SSR / no-JS behaviour:
 *   Before mount, no animation classes are applied at all — content
 *   renders at its natural opacity/position and remains visible.
 *   Animation classes are only added after the component hydrates,
 *   which means disabling JS never hides content.
 *
 * JS behaviour:
 *   1. Mount  → hidden classes applied (opacity-0 + translate)
 *   2. Element enters viewport → visible classes applied + CSS transition plays
 *   Fires once per element; never re-hides on scroll-back.
 *
 * No layout shift:
 *   CSS transforms and opacity changes do not affect layout flow (no CLS).
 *
 * Usage:
 *   <AnimateIn delay={150} from="bottom">…</AnimateIn>
 *   <AnimateIn delay={300} from="left">…</AnimateIn>
 */

// Full class strings so Tailwind's static scanner keeps them in the bundle.
const HIDDEN: Record<Direction, string> = {
  bottom: "opacity-0 translate-y-6",
  left:   "opacity-0 -translate-x-8",
  right:  "opacity-0 translate-x-8",
};

const VISIBLE = "opacity-100 translate-y-0 translate-x-0";

export function AnimateIn({ children, delay = 0, className = "", from = "bottom" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // `mounted` gates ALL animation classes.
  // false → SSR / pre-hydration: no classes applied, content naturally visible.
  // true  → JS has run: hidden classes applied until IntersectionObserver fires.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Switch to animated mode — element will be hidden until IO fires.
    setMounted(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect(); // animate once only
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── SSR / no-JS path ────────────────────────────────────────────────────
  // No animation classes → content renders at full opacity in its natural
  // position. ref is attached so the effect can find the element on mount.
  if (!mounted) {
    return (
      <div ref={ref} className={className || undefined}>
        {children}
      </div>
    );
  }

  // ── JS / animated path ──────────────────────────────────────────────────
  return (
    <div
      ref={ref}
      className={[
        "transition-all duration-700 ease-out",
        visible ? VISIBLE : HIDDEN[from],
        className,
      ].filter(Boolean).join(" ")}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
