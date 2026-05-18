"use client";

/**
 * HomeIntro — ultra-premium intro animation overlay.
 *
 * Design language: minimal, cinematic, high-trust fintech / legal-tech.
 * Inspired by Stripe, Linear, Arc motion design — restrained and precise.
 *
 * ── Animation timeline ────────────────────────────────────────────────────────
 *   0.00s  Overlay mounts; ambient radial glow fades in
 *   0.00s  Secure path begins drawing from top-right (RTL-aware)
 *   0.90s  Line completes; arrival dot appears at terminus (center)
 *   0.52s  Logo begins blur-to-clear reveal (overlaps with line draw)
 *   0.96s  Soft emerald checkmark pops in
 *   1.14s  Confirmation text "מאומת" fades up
 *   1.90s  Exit begins — overlay dissolves into hero (matching gradient)
 *   2.60s  Component unmounts (AnimatePresence exit: 700ms)
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *   • null on server — zero SSR output; homepage SEO unaffected
 *   • sessionStorage prevents replay within the same browser session
 *   • useReducedMotion: skips overlay entirely if preference is set
 *   • AnimatePresence owns the exit animation before unmount
 *   • All animations: transform + opacity + filter only (GPU-composited)
 *   • SVG pathLength is animated by Framer Motion (auto computes dasharray)
 *   • Background gradient exactly matches HeroSection → seamless dissolve
 *
 * ── Imports ───────────────────────────────────────────────────────────────────
 *   motion/react (v12) — AnimatePresence, motion, useReducedMotion, Variants
 */

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_KEY = "sd-intro-seen";

// Auto-dismiss: how long the intro stays visible before the exit begins.
// Exit animation itself takes 700ms (see overlayExitVariants below).
const VISIBLE_DURATION_MS = 1_900;

// ── Easing presets ────────────────────────────────────────────────────────────
// Cubic-bezier curves that match the Stripe / Linear motion language.

/** Smooth deceleration — fast in, slow stop. Used for most reveals. */
const EASE_OUT_QUINT  = [0.22, 1, 0.36, 1] as const;

/** Gentle spring overshoot — for the checkmark "pop". */
const EASE_SPRING     = [0.34, 1.56, 0.64, 1] as const;

/** Cinematic ease-out for the overlay exit scale. */
const EASE_EXIT       = [0.4, 0, 1, 1] as const;

// ── Framer Motion variants ────────────────────────────────────────────────────

/**
 * The full-screen overlay.
 * initial: already visible (opacity: 1, no transform) — no entrance animation.
 * exit:    slight scale-up (expands "into" the page) + fade to reveal hero.
 *          The matching gradient makes this dissolve truly seamless.
 */
const overlayVariants: Variants = {
  initial: { opacity: 1, scale: 1 },
  exit: {
    opacity: 0,
    scale: 1.012,
    transition: { duration: 0.7, ease: EASE_EXIT },
  },
};

/**
 * "SignDeal" wordmark.
 * Starts blurred + invisible + slightly below center.
 * Delays 520ms so the line is well into its draw before the logo appears.
 */
const logoVariants: Variants = {
  hidden:  { opacity: 0, y: 10, filter: "blur(12px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: EASE_OUT_QUINT, delay: 0.52 },
  },
};

/**
 * Soft emerald checkmark badge.
 * Spring-like scale pop — springs from invisible to full size.
 * intentionally NOT a hard snap: the spring overshoot reads as "alive".
 */
const checkVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.25, rotate: -12 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { duration: 0.38, ease: EASE_SPRING, delay: 0.96 },
  },
};

/**
 * Hebrew confirmation line "מאומת".
 * Floats up 5px while fading in. Very subtle — must not compete with logo.
 */
const confirmTextVariants: Variants = {
  hidden:  { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: EASE_OUT_QUINT, delay: 1.14 },
  },
};

/** Skip button — plain fade-in, no motion. */
const skipVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: "easeOut", delay: 0.55 },
  },
};

// ── Root component (exported) ─────────────────────────────────────────────────

/**
 * Mounts once per session.
 * Returns null on SSR and on subsequent visits (sessionStorage gate).
 */
export function HomeIntro() {
  const [show,        setShow]      = useState(false);
  const prefersReduced              = useReducedMotion();

  useEffect(() => {
    // Respect user's motion preference — skip overlay entirely.
    if (prefersReduced) return;
    // Session gate — only show once per browser session.
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(true);

    const timer = window.setTimeout(() => setShow(false), VISIBLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [prefersReduced]);

  return (
    <AnimatePresence>
      {show && <IntroOverlay onDismiss={() => setShow(false)} />}
    </AnimatePresence>
  );
}

// ── Inner overlay (rendered only while `show === true`) ───────────────────────

function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      aria-hidden="true"
      variants={overlayVariants}
      initial="initial"
      exit="exit"
      // Gradient exactly matches HeroSection base background → seamless dissolve.
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden
                 bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800"
    >
      {/* ── Layer 1: Grid texture ─────────────────────────────────────────── */}
      {/*
        Same grid as HeroSection (backgroundSize 48px, opacity ~0.025).
        Edge-masked so it fades at viewport borders for depth.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          backgroundImage:
            "linear-gradient(to right,  rgba(255,255,255,0.03) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          WebkitMaskImage: "radial-gradient(ellipse 72% 60% at 50% 50%, black 15%, transparent 90%)",
          maskImage:       "radial-gradient(ellipse 72% 60% at 50% 50%, black 15%, transparent 90%)",
        }}
      />

      {/* ── Layer 2: Cinematic noise ──────────────────────────────────────── */}
      {/*
        SVG feTurbulence at fractalNoise / baseFrequency 0.85 gives a
        fine-grained film-grain texture.  At opacity 0.022 it is barely
        perceptible but adds the subtle tactility of premium product design.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.022,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E" +
            "%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' " +
            "baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E" +
            "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ── Layer 3: Ambient radial glow ─────────────────────────────────── */}
      {/*
        Positioned at 50% 50%.  Fades in slowly (1.2s) so it doesn't flash on.
        Matches the hero's central violet glow for visual continuity.
      */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(ellipse 56% 44% at 50% 52%, " +
            "rgba(99,102,241,0.20) 0%, " +
            "rgba(79,70,229,0.09) 40%, " +
            "transparent 70%)",
        }}
      />

      {/* ── Centre stage ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-7 select-none px-6">

        {/* ── Secure path SVG ────────────────────────────────────────────── */}
        {/*
          viewBox: 0 0 560 70
          Path: M 540,16 C 460,16 390,62 280,38
            • Starts at (540,16) — upper-right corner (RTL: reading start)
            • Single smooth Bezier arc to (280,38) — geometric center
            • Begins horizontal (premium restraint) then curves down to center
            • Feels like "data traveling through a secure channel"
            NOT like a handwritten signature (no oscillation, no wavy loops)

          Two layers:
            1. Halo path — blurred / wide / low opacity (soft luminance)
            2. Precision line — 1px sharp, high contrast (the actual path)
        */}
        <div className="w-[min(560px,88vw)] h-[70px]">
          <svg
            viewBox="0 0 560 70"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full overflow-visible"
            aria-hidden="true"
            role="presentation"
          >
            <defs>
              {/* Soft glow — not neon, just warm luminance around the line */}
              <filter id="sd2-glow" x="-20%" y="-100%" width="140%" height="300%">
                <feGaussianBlur stdDeviation="2.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Wider halo for the background glow path */}
              <filter id="sd2-halo" x="-20%" y="-120%" width="140%" height="340%">
                <feGaussianBlur stdDeviation="7" />
              </filter>

              {/* Dot glow (arrival point) */}
              <filter id="sd2-dot-glow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Path constant — both layers share the same d attribute */}
            {/* Start: top-right (540,16).  End: geometric center (280,38). */}
            {/* Single cubic Bezier — starts horizontal, then graceful arc.  */}

            {/* Layer A: Halo (blurred, behind) — soft luminance envelope */}
            <motion.path
              d="M 540,16 C 460,16 390,62 280,38"
              fill="none"
              stroke="#6366f1"
              strokeWidth="6"
              strokeLinecap="round"
              filter="url(#sd2-halo)"
              style={{ opacity: 0.22 }}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: 0.98,
                ease:     EASE_OUT_QUINT,
                delay:    0.04,
              }}
            />

            {/* Layer B: Precision line — 1px, sharp, indigo-400 */}
            <motion.path
              d="M 540,16 C 460,16 390,62 280,38"
              fill="none"
              stroke="#818cf8"
              strokeWidth="1"
              strokeLinecap="round"
              filter="url(#sd2-glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.88 }}
              transition={{
                pathLength: { duration: 0.98, ease: EASE_OUT_QUINT },
                opacity:    { duration: 0.15, ease: "easeOut" },
              }}
            />

            {/* Origin dot — appears immediately at the start point (540,16) */}
            <motion.circle
              cx={540}
              cy={16}
              r={2}
              fill="#a5b4fc"
              filter="url(#sd2-glow)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />

            {/* Arrival dot — appears at terminus (280,38) when line completes */}
            {/* This is the "verification confirmed" signal before the logo. */}
            <motion.circle
              cx={280}
              cy={38}
              r={3}
              fill="#818cf8"
              filter="url(#sd2-dot-glow)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.65 }}
              transition={{ duration: 0.35, ease: EASE_OUT_QUINT, delay: 0.90 }}
            />
          </svg>
        </div>

        {/* ── SignDeal wordmark ───────────────────────────────────────────── */}
        {/*
          dir="ltr": "SignDeal" is an English brand name — must render LTR
          even inside the RTL document, otherwise flex reverses "Deal Sign".
          The logo appears as the line reaches center (delay 0.52s).
          blur(12px) → blur(0px) gives the "coming into focus" reveal.
        */}
        <motion.div
          variants={logoVariants}
          initial="hidden"
          animate="visible"
          dir="ltr"
          className="flex items-center gap-2"
        >
          {/* "Sign" — crisp white with very soft violet text-shadow */}
          <span
            className="text-4xl sm:text-5xl font-black tracking-tight leading-none text-white"
            style={{
              textShadow:
                "0 0 28px rgba(165,180,252,0.35)," +
                "0 0 56px rgba(99,102,241,0.18)," +
                "0 1px 0  rgba(255,255,255,0.05)",
            }}
          >
            Sign
          </span>

          {/* "Deal" — indigo gradient, slightly luminous */}
          <span
            className="text-4xl sm:text-5xl font-black tracking-tight leading-none"
            style={{
              background:
                "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 48%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip:      "text",
              filter:              "drop-shadow(0 0 10px rgba(99,102,241,0.35))",
            }}
          >
            Deal
          </span>

          {/* Soft emerald checkmark — NOT neon green */}
          {/*
            Color rationale: emerald-300 (#6ee7b7) at low opacity on a
            dark emerald-900/50 background reads as "muted confirmation",
            not as a neon accent.  The box-shadow is very subtle — adds
            depth without glow/flash.
          */}
          <motion.span
            variants={checkVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center justify-center
                       w-7 h-7 sm:w-8 sm:h-8 rounded-full
                       bg-emerald-950/60 border border-emerald-700/35
                       self-center ml-1"
            style={{ boxShadow: "0 0 14px rgba(16,185,129,0.10)" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6ee7b7"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.span>
        </motion.div>

        {/* ── Confirmation text ───────────────────────────────────────────── */}
        {/*
          "מאומת" = "verified" in Hebrew.
          Tiny, extremely low opacity — purely atmospheric, not informational.
          tracking-[0.25em] spreads it out for elegance; in Hebrew this is fine
          as the letters are distinct and spacing reads well even RTL.
        */}
        <motion.p
          variants={confirmTextVariants}
          initial="hidden"
          animate="visible"
          dir="rtl"
          className="text-[10px] text-indigo-300/35 font-medium"
          style={{ letterSpacing: "0.22em" }}
        >
          מ א ו מ ת
        </motion.p>
      </div>

      {/* ── Skip button ─────────────────────────────────────────────────────── */}
      {/*
        Physically at bottom-left (in RTL layout this is the "end" corner —
        unobtrusive but reachable).
        Very low contrast so it doesn't distract; brightens on hover.
      */}
      <motion.button
        type="button"
        onClick={onDismiss}
        variants={skipVariants}
        initial="hidden"
        animate="visible"
        className="absolute bottom-8 left-8
                   text-xs text-indigo-300/30 hover:text-indigo-200/60
                   px-3 py-1.5 rounded-full
                   border border-indigo-500/12 hover:border-indigo-400/28
                   transition-colors duration-200 cursor-pointer
                   focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/40"
        aria-label="דלג על האנימציה"
      >
        דלג ›
      </motion.button>
    </motion.div>
  );
}
