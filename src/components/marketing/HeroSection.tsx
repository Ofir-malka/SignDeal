"use client";

import { useRef }                     from "react";
import Link                           from "next/link";
import { AnimateIn }                  from "@/components/marketing/ui/AnimateIn";
import { BackgroundGlowSystem }       from "@/components/marketing/hero/BackgroundGlowSystem";
import { FloatingBadges }             from "@/components/marketing/hero/FloatingBadges";
import { LivingLedger }               from "@/components/marketing/hero/LivingLedger";
import { FeaturePills }               from "@/components/marketing/hero/FeaturePills";
import { HeroCursorProvider }         from "@/components/marketing/hero/HeroCursorContext";

/**
 * HeroSection — public marketing homepage hero.
 *
 * Slim orchestrator: layout, text copy, CTA buttons, and entrance timing.
 * All visual subsystems are in dedicated components under ./hero/:
 *   BackgroundGlowSystem — grid, radial glows, network energy, vignette
 *   FloatingBadges       — depth-field floating status chips (desktop)
 *   LivingLedger         — 3D animated dashboard mock with live event feed
 *   FeaturePills         — stats strip with liquid morph tooltips + flip counter
 *
 * ── Layout ────────────────────────────────────────────────────────────────────
 * Mobile  : single column, centered text, LivingLedger below
 * Desktop : two columns (RTL — text right, card left)
 *
 * ── Phase 3 (Cinematic Polish) changes ───────────────────────────────────────
 * • Background: deeper black-violet base for more cinematic contrast.
 * • Cinematic vignette: radial edge-darkening focuses eye on the hero core.
 * • Directional focus light: soft spot over headline + card zone.
 * • Card column: slightly wider (460 px) + flex-[1.1] for more presence.
 * • Gap tightened: gap-14 → gap-10 / gap-20 → gap-14 — card feels integrated.
 * • Typography: tracking-[-0.025em] + leading-[1.04] for premium display weight.
 * • Subheadline: lower opacity + generous line-height for breathing hierarchy.
 * • Primary CTA: wider padding, no violet hover-glow (reduce noise).
 * • Secondary CTA: intentional tonal difference from primary.
 * • Trust copy: more restrained opacity (luxury understates).
 */

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex flex-col justify-center overflow-hidden
                 bg-gradient-to-br from-[#060418] via-indigo-950 to-[#1a1445] pt-16"
      style={{ contain: "paint" }}
    >
    <HeroCursorProvider sectionRef={sectionRef}>
      {/* ── Background layers ──────────────────────────────────────────────── */}
      <BackgroundGlowSystem />

      {/* ── Cinematic lighting ────────────────────────────────────────────── */}

      {/* Vignette: darkens the perimeter, draws the eye inward toward the
           headline and card. The ellipse is off-center to the right (55 %)
           and slightly high (38 %) matching the RTL layout's visual center. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          background:
            "radial-gradient(ellipse 78% 72% at 55% 38%, transparent 28%, rgba(4,2,20,0.60) 100%)",
        }}
      />

      {/* Directional focus light: an ultra-subtle violet spot over the zone
           where the H1 and card live. Adds a sense of intent illumination —
           like a cinematographer's key light placed off-centre.              */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 44% at 55% 28%, rgba(139,92,246,0.052) 0%, transparent 70%)",
        }}
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="relative max-w-6xl mx-auto px-6 py-20 sm:py-24
                   flex flex-col lg:flex-row items-center gap-10 lg:gap-14"
      >

        {/* ── Text column ── */}
        <div className="flex-[0.9] flex flex-col items-center lg:items-start gap-6 text-center lg:text-right lg:max-w-[460px]">

          {/* Badge */}
          <AnimateIn delay={0}>
            <div className="inline-flex items-center gap-2 bg-white/[0.07] border border-white/[0.14] rounded-full px-4 py-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-violet-400/80 shrink-0 animate-pulse"
                aria-hidden="true"
              />
              <span className="text-xs text-white/65 font-medium tracking-wide">
                פלטפורמה לסוכני נדל״ן בישראל
              </span>
            </div>
          </AnimateIn>

          {/*
            H1 — upgraded to text-6xl/7xl/8xl + per-line mask-up reveal.

            Each line sits in an `overflow-hidden block` span (clip mask).
            The inner span starts at translateY(112%) and slides to 0 via
            hero-line-reveal (globals.css). animation-fill-mode: both keeps
            text hidden during the delay and holds position after the animation.

            Gradient: white → violet-300 (RTL — violet blooms from the left end).
            Reduced motion: global @media collapses duration to 0.01ms (instant).
          */}
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-[-0.025em] leading-[1.04]">
            {/* Line 1 — fires at 80ms */}
            <span className="block overflow-hidden pb-[0.06em]">
              <span
                className="block bg-gradient-to-l from-white via-white to-violet-300 bg-clip-text text-transparent"
                style={{
                  animation:
                    "hero-line-reveal 0.85s cubic-bezier(0.22,1,0.36,1) 0.08s both",
                }}
              >
                חוזי תיווך דיגיטליים,
              </span>
            </span>
            {/* Line 2 — fires at 240ms (160ms stagger after line 1) */}
            <span className="block overflow-hidden pb-[0.06em]">
              <span
                className="block bg-gradient-to-l from-white via-white to-violet-300 bg-clip-text text-transparent"
                style={{
                  animation:
                    "hero-line-reveal 0.85s cubic-bezier(0.22,1,0.36,1) 0.24s both",
                }}
              >
                חתימה וגבייה — בלחיצה אחת.
              </span>
            </span>
          </h1>

          {/* Subheadline — after line 2 has started (t ≈ 420ms) */}
          <AnimateIn delay={420}>
            <p className="text-lg text-indigo-100/60 leading-[1.8] max-w-[440px]">
              SignDeal בונה את החוזה, שולח לחתימה ב-SMS, ומאפשר ללקוח
              לשלם את העמלה ישירות מהנייד — בלי ניירת, בלי מרדף.
            </p>
          </AnimateIn>

          {/* CTAs — after subheadline (t ≈ 560ms) */}
          <AnimateIn delay={560}>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">

              {/*
                Primary CTA — shimmer sweep on hover.
                hero-cta-shimmer + hero-cta-shimmer-layer: see globals.css.
              */}
              <Link
                href="/register"
                className="relative overflow-hidden hero-cta-shimmer
                           w-full sm:w-auto inline-flex items-center justify-center gap-2
                           bg-white text-indigo-700 font-black text-sm
                           px-8 py-[14px] rounded-xl
                           ring-1 ring-white/30
                           hover:scale-[1.02] hover:bg-indigo-50
                           active:scale-[0.97]
                           transition-all duration-200 ease-out shadow-xl shadow-black/25"
              >
                <span aria-hidden="true" className="hero-cta-shimmer-layer" />
                התחל חינם — ללא כרטיס אשראי
                <svg
                  width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                  className="rotate-180"
                >
                  <polyline points="9 18 3 12 9 6" />
                </svg>
              </Link>

              {/* Secondary CTA */}
              <a
                href="#how"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2
                           bg-transparent border border-white/[0.12] text-indigo-200/75 font-medium text-sm
                           px-7 py-4 rounded-xl
                           hover:scale-[1.02] hover:bg-white/[0.12]
                           hover:text-white hover:border-white/25
                           active:scale-[0.97]
                           transition-all duration-200 ease-out"
              >
                צפה איך זה עובד
                <svg
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="12" y1="5"  x2="12" y2="19" />
                  <polyline points="5 12 12 19 19 12" />
                </svg>
              </a>
            </div>
          </AnimateIn>

          {/* Feature pills with liquid morph tooltips + flip counter */}
          <FeaturePills />

          {/* Micro trust-copy — after all chips (t ≈ 800ms) */}
          <AnimateIn delay={800}>
            <p className="text-xs text-indigo-300/32">
              ללא כרטיס אשראי · ביטול בכל עת · תמיכה בעברית
            </p>
          </AnimateIn>
        </div>

        {/* ── Mock UI column — anchor for floating chips ── */}
        {/*
          overflow-hidden on mobile clips any glow bleeds.
          lg:overflow-visible lets floating chips bleed outside on desktop.
        */}
        <div className="relative flex-[1.4] w-full max-w-[400px] lg:max-w-[560px] overflow-hidden lg:overflow-visible">

          {/* Floating depth-field badges — desktop only, aria-hidden */}
          <FloatingBadges />

          {/*
            LivingLedger — the 3D animated dashboard card.
            AnimateIn from="bottom" at t=320ms: right column assembles on its
            own track while the left column builds top-down.
          */}
          <AnimateIn delay={320} from="bottom">
            <LivingLedger />
          </AnimateIn>
        </div>

      </div>
    </HeroCursorProvider>
    </section>
  );
}
