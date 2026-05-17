"use client";

/**
 * HomeIntro — full-screen intro overlay for the marketing homepage.
 *
 * ── Isolation guarantee ────────────────────────────────────────────────────────
 * • Returns null on first server render (visible starts false) → zero SSR output.
 * • useEffect runs only in the browser; sessionStorage prevents repeat shows.
 * • Homepage DOM is always present underneath — SEO is unaffected.
 * • No external packages; animations are pure CSS @keyframes (globals.css).
 *
 * ── prefers-reduced-motion ─────────────────────────────────────────────────────
 * • JS: matchMedia check → skip overlay entirely if enabled.
 * • CSS: globals.css collapses all animation-durations to 0.01ms (belt+suspenders).
 *
 * ── Animation timeline (~2 s total) ───────────────────────────────────────────
 *   0 ms        Overlay appears; radial glow breathes in
 *   0–620 ms    SVG signature draws right-to-left (sd-draw)
 *   300–720 ms  "SignDeal" wordmark fades in, blur → clear (sd-fadein-blur)
 *   520–900 ms  Tagline appears
 *   600 ms      Skip button fades in
 *   700–900 ms  Sparkle dots twinkle on (staggered sd-twinkle, 7 dots)
 *   700–1300 ms Shimmer sweep races along drawn stroke (sd-shimmer)
 *   750–1030 ms Checkmark pops in
 *   900 ms+     Stroke pulses gently (sd-glow-pulse)
 *   2 000 ms    Phase → "leaving"; overlay fades + slides up
 *   2 500 ms    Component unmounts
 *
 * ── SVG path ──────────────────────────────────────────────────────────────────
 * viewBox 0 0 300 60.  Path starts at x=275 (right), flows left.
 * stroke-dasharray / stroke-dashoffset = 310 (measured path length).
 */

import { useEffect, useState } from "react";

type Phase = "visible" | "leaving";

const SESSION_KEY = "sd-intro-seen";

// Fixed sparkle positions along the signature path curve.
// Each [cx, cy, delay] — delays are staggered so they fire after the draw finishes.
const SPARKLES: [number, number, number][] = [
  [248, 20, 710],   // near start peak
  [213, 54, 760],   // first valley
  [175, 24, 810],   // second peak
  [148, 52, 860],   // second valley
  [108, 30, 780],   // third hill
  [ 75, 40, 840],   // late middle
  [ 30, 22, 900],   // near tail
];

export function HomeIntro() {
  const [visible, setVisible] = useState(false);
  const [phase,   setPhase]   = useState<Phase>("visible");

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem(SESSION_KEY, "1");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(true);

    const leaveTimer   = window.setTimeout(() => setPhase("leaving"), 2_000);
    const unmountTimer = window.setTimeout(() => setVisible(false),   2_500);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);

  function dismiss() {
    setPhase("leaving");
    window.setTimeout(() => setVisible(false), 500);
  }

  if (!visible) return null;

  const isLeaving = phase === "leaving";

  return (
    <div
      aria-hidden="true"
      className={[
        "fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden",
        "bg-gradient-to-br from-indigo-950 via-purple-950 to-indigo-900",
        "transition-all duration-500 ease-in-out",
        isLeaving
          ? "opacity-0 -translate-y-3 pointer-events-none"
          : "opacity-100 translate-y-0",
      ].join(" ")}
    >
      {/* ── Radial ambient glow — sits behind all content ─────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 50% 50%, rgba(139,92,246,0.18) 0%, rgba(109,40,217,0.08) 45%, transparent 70%)",
          animation: "sd-glow-breathe 2.4s ease-in-out infinite",
        }}
      />

      {/* ── Centre stage ──────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-6 select-none">

        {/* ── SVG: signature + shimmer + sparkles ─────────────────────────── */}
        <svg
          viewBox="0 0 300 60"
          xmlns="http://www.w3.org/2000/svg"
          className="w-72 sm:w-96 h-auto overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {/* Neon glow filter for the main stroke */}
            <filter id="sd-glow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Glow filter for shimmer + sparkles */}
            <filter id="sd-glow-sm" x="-40%" y="-120%" width="180%" height="340%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Gradient along the stroke — light violet → deep violet, RTL paint */}
            <linearGradient id="sd-stroke-grad" x1="100%" y1="0" x2="0%" y2="0">
              <stop offset="0%"   stopColor="#ddd6fe" />  {/* violet-200 */}
              <stop offset="40%"  stopColor="#a78bfa" />  {/* violet-400 */}
              <stop offset="100%" stopColor="#6d28d9" />  {/* violet-700 */}
            </linearGradient>

            {/* Shimmer gradient — pure white core with soft edges */}
            <linearGradient id="sd-shimmer-grad" x1="100%" y1="0" x2="0%" y2="0">
              <stop offset="0%"   stopColor="white" stopOpacity="0"   />
              <stop offset="45%"  stopColor="white" stopOpacity="0.9" />
              <stop offset="55%"  stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0"   />
            </linearGradient>
          </defs>

          {/* ── Main signature path ──────────────────────────────────────── */}
          <path
            d="M 275,38 C 255,16 232,60 205,38 C 185,22 168,54 148,38 C 128,23 110,52 88,40 L 65,36 C 50,32 35,28 18,24"
            fill="none"
            stroke="url(#sd-stroke-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#sd-glow)"
            style={{
              strokeDasharray:  310,
              strokeDashoffset: 310,
              animation:
                "sd-draw 620ms cubic-bezier(0.4, 0, 0.2, 1) forwards," +
                "sd-glow-pulse 2s ease-in-out 0.95s infinite",
            }}
          />

          {/* ── Shimmer sweep — bright segment chases the drawn line ─────── */}
          <path
            d="M 275,38 C 255,16 232,60 205,38 C 185,22 168,54 148,38 C 128,23 110,52 88,40 L 65,36 C 50,32 35,28 18,24"
            fill="none"
            stroke="url(#sd-shimmer-grad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            filter="url(#sd-glow-sm)"
            style={{
              strokeDasharray:  "55 255",
              strokeDashoffset: 360,
              animation:
                "sd-shimmer 620ms cubic-bezier(0.4, 0, 0.6, 1) 700ms forwards",
            }}
          />

          {/* ── Sparkle dots — twinkling along the path after draw ───────── */}
          {SPARKLES.map(([cx, cy, delayMs], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="1.6"
              fill="#e9d5ff"   /* violet-200 */
              filter="url(#sd-glow-sm)"
              style={{
                opacity: 0,
                animation:
                  `sd-twinkle 900ms ease-in-out ${delayMs}ms forwards`,
              }}
            />
          ))}
        </svg>

        {/* ── "SignDeal" wordmark ────────────────────────────────────────── */}
        {/*
          dir="ltr" is essential: the brand name is English and must read
          left-to-right regardless of the document's RTL context.
          Without it, flex reverses the span order and shows "Deal Sign".
        */}
        <div
          dir="ltr"
          style={{
            opacity: 0,
            animation:
              "sd-fadein-blur 440ms cubic-bezier(0.4, 0, 0.2, 1) 300ms forwards",
          }}
          className="flex items-center gap-1.5"
        >
          {/* "Sign" — crisp white, strong text-shadow glow */}
          <span
            className="text-4xl sm:text-5xl font-black tracking-tight leading-none text-white"
            style={{
              textShadow:
                "0 0 20px rgba(196,181,253,0.55)," +
                "0 0 40px rgba(139,92,246,0.30)," +
                "0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            Sign
          </span>

          {/* "Deal" — gradient violet */}
          <span
            className="text-4xl sm:text-5xl font-black tracking-tight leading-none"
            style={{
              background:
                "linear-gradient(135deg, #ddd6fe 0%, #a78bfa 55%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 12px rgba(139,92,246,0.5))",
            }}
          >
            Deal
          </span>

          {/* Checkmark badge */}
          <span
            style={{
              opacity: 0,
              animation:
                "sd-popin 300ms cubic-bezier(0.34, 1.56, 0.64, 1) 780ms forwards",
            }}
            className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-violet-500/20 border border-violet-400/40 self-center ml-0.5"
          >
            <svg
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ddd6fe"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        </div>

        {/* Tagline */}
        <p
          dir="rtl"
          style={{
            opacity: 0,
            animation: "sd-fadein-blur 380ms ease-out 540ms forwards",
          }}
          className="text-sm text-violet-300/65 tracking-wide"
        >
          חוזי תיווך דיגיטליים לסוכני נדל״ן
        </p>
      </div>

      {/* ── Skip button ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={dismiss}
        style={{
          opacity: 0,
          animation: "sd-fadein-blur 300ms ease-out 620ms forwards",
        }}
        className={[
          "absolute bottom-8 left-8",
          "text-xs text-violet-300/45 hover:text-violet-200/80",
          "px-3 py-1.5 rounded-full border border-violet-500/20 hover:border-violet-400/40",
          "transition-colors duration-200 cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60",
        ].join(" ")}
        aria-label="דלג על האנימציה"
      >
        דלג ›
      </button>
    </div>
  );
}
