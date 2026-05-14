import Link from "next/link";
import { AnimateIn } from "@/components/marketing/ui/AnimateIn";
import { GlassCard }  from "@/components/marketing/ui/GlassCard";

/**
 * Hero section — public marketing homepage.
 *
 * Layout:
 *  • Mobile  : single column, centered text, mock below
 *  • Desktop : two columns (RTL — text on right, mock on left)
 *
 * Visual upgrades (Phase 6.5):
 *  • Grid texture overlay (pure CSS, no deps)
 *  • Layered radial glows for depth
 *  • DashboardMock wrapped in premium browser/app frame
 *  • Floating live-status chips around the mock (desktop only)
 *  • Stronger primary CTA with ring
 *  • Stats strip in contained pill with dividers
 *
 * Server component — AnimateIn (client) handles entrance animations.
 * Mock UI is decorative (aria-hidden) and uses the float keyframe
 * defined in globals.css.
 */

// ─── Hero stat items ──────────────────────────────────────────────────────────

const HERO_STATS = [
  {
    label: "3 דקות לחוזה",
    /* subtle tick: rotates 8° then snaps back every 3.5 s */
    iconAnim: "animate-[hero-clock-tick_3.5s_ease-in-out_infinite]",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "חתימה ב-SMS",
    /* gentle 2.5 s float nudge */
    iconAnim: "animate-[hero-sms-bounce_2.5s_ease-in-out_infinite]",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "תשלום מאובטח",
    /* subtle lift + tilt every 4 s */
    iconAnim: "animate-[hero-card-tilt_4s_ease-in-out_infinite]",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
] as const;

// ─── Floating live-status chips ───────────────────────────────────────────────

const HERO_CHIPS = [
  {
    label: "לקוח חתם עכשיו",
    dot:   "bg-violet-400",
    color: "text-violet-300",
    cls:   "-right-4 lg:-right-8 top-10",
  },
  {
    label: "₪12,000 התקבל",
    dot:   "bg-emerald-400",
    color: "text-emerald-300",
    cls:   "-right-6 lg:-right-10 bottom-24",
  },
  {
    label: "SMS נפתח",
    dot:   "bg-blue-400",
    color: "text-blue-300",
    cls:   "left-3 -top-4",
  },
] as const;

// ─── Exported section ─────────────────────────────────────────────────────────

export function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden
                 bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 pt-16"
      style={{ contain: "paint" }}
    >
      {/* ── Background layers ─────────────────────────────────────────────── */}

      {/* Grid texture — very subtle, fades at edges with mask */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)",
        }}
      />

      {/* Central violet radial glow — slow opacity breathe.
           overflow-hidden on the wrapper ensures the 700 px inner glow is
           double-clipped here before reaching the section boundary.        */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
      >
        <div className="w-[700px] h-[700px] bg-violet-600/15 rounded-full blur-3xl
                        animate-[hero-glow-breathe_9s_ease-in-out_infinite]" />
      </div>

      {/* Top-right accent glow — offset phase so it doesn't sync with centre.
           right-0 (was -right-24) keeps the element within the section's right
           boundary so it can't escape overflow clipping on iOS Safari.         */}
      <div
        aria-hidden="true"
        className="absolute -top-24 right-0 w-[480px] h-[480px]
                   bg-violet-500/[0.07] rounded-full blur-3xl pointer-events-none select-none"
        style={{ animation: "hero-glow-breathe 12s 3.5s ease-in-out infinite" }}
      />

      {/* Bottom section blend */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-40
                   bg-gradient-to-b from-transparent to-indigo-950
                   pointer-events-none select-none"
      />

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="relative max-w-6xl mx-auto px-6 py-20 sm:py-24
                   flex flex-col lg:flex-row items-center gap-14 lg:gap-20"
      >

        {/* ── Text column ── */}
        <div className="flex-1 flex flex-col items-center lg:items-start gap-7 text-center lg:text-right">

          {/* Badge */}
          <AnimateIn delay={0}>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 animate-pulse" aria-hidden="true" />
              <span className="text-xs text-white/80 font-medium">פלטפורמה לסוכני נדל״ן בישראל</span>
            </div>
          </AnimateIn>

          {/* H1 — benefit-first headline; keywords for SEO */}
          <AnimateIn delay={100}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.15]">
              <span
                className="bg-gradient-to-l from-white via-white to-violet-300
                           bg-clip-text text-transparent"
              >
                חוזי תיווך דיגיטליים,
                <br />
                חתימה וגבייה — בלחיצה אחת.
              </span>
            </h1>
          </AnimateIn>

          {/* Subheadline */}
          <AnimateIn delay={200}>
            <p className="text-lg sm:text-xl text-indigo-200/80 leading-relaxed max-w-lg tracking-normal">
              SignDeal בונה את החוזה, שולח לחתימה ב-SMS, ומאפשר ללקוח
              לשלם את העמלה ישירות מהנייד — בלי ניירת, בלי מרדף.
            </p>
          </AnimateIn>

          {/* CTAs */}
          <AnimateIn delay={300}>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">

              {/* Primary — stronger weight + ring */}
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2
                           bg-white text-indigo-700 font-black text-sm
                           px-7 py-4 rounded-xl
                           ring-1 ring-white/30
                           hover:scale-[1.02] hover:bg-indigo-50
                           hover:shadow-[0_0_32px_rgba(139,92,246,0.4)]
                           active:scale-[0.97]
                           transition-all duration-200 ease-out shadow-xl shadow-black/25"
              >
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

              {/* Secondary — more subtle */}
              <a
                href="#how"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2
                           bg-white/[0.07] border border-white/15 text-white/80 font-medium text-sm
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

          {/* Stats strip — pill container with dividers.
               Mobile: `flex w-full` → equal-width columns (3 × ~33%) so the
               strip never exceeds the viewport width. At `text-xs px-2` each
               item comfortably fits in the 114 px it gets on a 390 px screen.
               Desktop: `sm:inline-flex sm:w-auto` restores the natural pill. */}
          <AnimateIn delay={400}>
            <div
              dir="rtl"
              className="flex w-full sm:inline-flex sm:w-auto items-stretch rounded-2xl
                         bg-white/[0.04] border border-white/[0.09]
                         overflow-hidden"
            >
              {HERO_STATS.map(({ label, icon, iconAnim }, i) => (
                <span
                  key={label}
                  className={[
                    // flex-1 on mobile gives each item 1/3 of the strip width.
                    // sm:flex-none restores the natural content-width on desktop.
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2.5",
                    "transition-colors duration-200 hover:bg-white/[0.05]",
                    i > 0 ? "border-r border-white/[0.09]" : "",
                  ].join(" ")}
                >
                  {/* Icon wrapper carries the desktop micro-animation.
                       will-change-transform removed — reduces unnecessary
                       compositing layers on mobile.                       */}
                  <span
                    className={`text-violet-400 flex-shrink-0 inline-flex ${iconAnim}`}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  {/* text-xs on mobile (fits in ~114px column), sm:text-sm on desktop */}
                  <span className="text-xs sm:text-sm font-medium text-indigo-200/80 whitespace-nowrap">{label}</span>
                </span>
              ))}
            </div>
          </AnimateIn>

          {/* Micro trust-copy */}
          <AnimateIn delay={500}>
            <p className="text-xs text-indigo-300/45">
              ללא כרטיס אשראי · ביטול בכל עת · תמיכה בעברית
            </p>
          </AnimateIn>
        </div>

        {/* ── Mock UI column — relative anchor for floating chips ── */}
        {/* overflow-hidden on mobile clips the DashboardMock's -inset-8 glow so
             it cannot escape the column boundary. lg:overflow-visible lets the
             floating chips (hidden on mobile, shown on desktop) bleed outside. */}
        <div className="relative flex-1 w-full max-w-sm lg:max-w-md overflow-hidden lg:overflow-visible">

          {/* Floating live-status chips — desktop only, aria-hidden.
               Each chip drifts at a different duration + phase so they
               never move in lockstep (avoids mechanical feel).           */}
          {HERO_CHIPS.map(({ label, dot, color, cls }, chipIdx) => {
            // Different drift durations + start offsets per chip
            const DRIFT_STYLES = [
              { animation: "hero-drift 5s ease-in-out infinite" },
              { animation: "hero-drift 6.5s 1.3s ease-in-out infinite" },
              { animation: "hero-drift 4.5s 2.7s ease-in-out infinite" },
            ] as const;
            return (
              <div
                key={label}
                aria-hidden="true"
                className={[
                  // hidden on mobile — only shown on lg+. No will-change-transform
                  // to avoid creating unnecessary compositing layers.
                  "hidden lg:flex items-center gap-2 absolute z-20",
                  "bg-indigo-900/90 border border-white/[0.12] backdrop-blur-md",
                  "rounded-xl px-3 py-2 shadow-lg shadow-black/40",
                  "text-xs font-semibold",
                  color,
                  cls,
                ].join(" ")}
                style={DRIFT_STYLES[chipIdx]}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${dot}`} />
                {label}
              </div>
            );
          })}

          {/* Mock — float animation wraps only the frame, not the chips.
               from="bottom" (was "left") — eliminates the translateX(-32px)
               initial transform that caused iOS Safari to compute extra
               horizontal paint region during the hydration frame.           */}
          <AnimateIn delay={250} from="bottom">
            <DashboardMock />
          </AnimateIn>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Decorative contract-lifecycle mock — pure Tailwind, no real data.

   Visual upgrade: wrapped in a premium browser / app frame.
   Shows the full SignDeal workflow in a single card:
     contract created → SMS sent → signed → payment collected
   Float keyframe defined in globals.css.
───────────────────────────────────────────────────────────────────────── */

const LIFECYCLE_STEPS = [
  {
    label:  "חוזה נשלח לחתימה",
    sub:    "SMS נשלח ליוסי כהן",
    time:   "10:00",
    dotCls: "bg-violet-400",
    textCls:"text-violet-300",
  },
  {
    label:  "לקוח חתם",
    sub:    "חתימה דיגיטלית אומתה",
    time:   "10:14",
    dotCls: "bg-blue-400",
    textCls:"text-blue-300",
  },
  {
    label:  "בקשת תשלום נשלחה",
    sub:    "לינק מאובטח ב-SMS",
    time:   "10:15",
    dotCls: "bg-amber-400",
    textCls:"text-amber-300",
  },
  {
    label:  "עמלה ₪12,000 התקבלה",
    sub:    "הכסף בדרך אליך ✓",
    time:   "10:31",
    dotCls: "bg-emerald-400",
    textCls:"text-emerald-300",
  },
] as const;

function DashboardMock() {
  return (
    <div
      aria-hidden="true"
      className="relative animate-[float_4s_ease-in-out_infinite] will-change-transform"
    >
      {/* Depth glows — outside overflow-hidden frame so they bleed correctly */}
      <div className="absolute -inset-8 rounded-[2.5rem] bg-violet-600/[0.11] blur-3xl pointer-events-none" />
      <div className="absolute -inset-2 rounded-3xl bg-indigo-500/[0.07] blur-xl pointer-events-none" />

      {/* ── Browser / app frame — subtle border/glow brightens on hover ── */}
      <div
        className="relative rounded-2xl overflow-hidden
                   border border-white/[0.14]
                   shadow-[0_28px_60px_-8px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]
                   bg-indigo-950/90 backdrop-blur-xl
                   transition-[border-color,box-shadow] duration-500
                   hover:border-white/[0.24]
                   hover:shadow-[0_28px_60px_-8px_rgba(0,0,0,0.7),0_0_28px_rgba(139,92,246,0.12),0_0_0_1px_rgba(255,255,255,0.07)]"
      >
        {/* Chrome bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border-b border-white/[0.08]">
          {/* Traffic-light dots */}
          <div className="flex gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-400/60" />
            <div className="w-3 h-3 rounded-full bg-amber-400/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-400/60" />
          </div>

          {/* URL bar */}
          <div className="flex-1 flex justify-center">
            <div
              className="flex items-center gap-1.5
                         bg-white/[0.05] border border-white/[0.08]
                         rounded-md px-3 py-1 max-w-[185px] w-full"
            >
              <svg
                width="8" height="8" viewBox="0 0 24 24" fill="none"
                stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-[10px] text-indigo-400/70 font-mono tracking-tight truncate">
                app.signdeal.co.il
              </span>
            </div>
          </div>

          {/* Spacer to visually centre the URL bar */}
          <div className="w-[42px] shrink-0" />
        </div>

        {/* ── App content ── */}
        <div className="p-4 sm:p-5">
          <GlassCard variant="elevated" className="p-5 shadow-none">
            <div dir="rtl" className="space-y-4">

              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-md flex items-center justify-center">
                    <svg
                      width="12" height="12" viewBox="0 0 24 24"
                      fill="none" stroke="white" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-white text-xs font-semibold">SignDeal</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 font-medium">
                  הושלם ✓
                </span>
              </div>

              {/* Contract identity */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
                <p className="text-white text-xs font-semibold">חוזה תיווך — יוסי כהן</p>
                <p className="text-indigo-300/60 text-[11px] mt-0.5">רוטשילד 15, תל אביב · עמלה ₪12,000</p>
              </div>

              {/* Lifecycle timeline — rows stagger in sequentially on load.
                   Rows use animation-fill-mode:both so they stay hidden
                   until their delay fires, then hold visible state.
                   Base offset (200ms) lets the card entrance start first. */}
              <div className="space-y-0 relative">
                {LIFECYCLE_STEPS.map((step, i) => (
                  <div
                    key={step.label}
                    className="relative flex items-start gap-2.5 pb-3 last:pb-0
                               animate-[hero-row-in_0.5s_ease-out_both]"
                    style={{ animationDelay: `${200 + i * 190}ms` }}
                  >
                    {/* Connector line */}
                    {i < LIFECYCLE_STEPS.length - 1 && (
                      <div
                        className="absolute right-[9px] top-4 bottom-0 w-px bg-white/10"
                        aria-hidden="true"
                      />
                    )}
                    {/* Dot */}
                    <div
                      className={`relative z-10 mt-0.5 w-[18px] h-[18px] rounded-full
                                  ${step.dotCls}/20 border border-current
                                  flex items-center justify-center shrink-0 ${step.textCls}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${step.dotCls}`} />
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-[11px] font-semibold ${step.textCls}`}>{step.label}</p>
                        <span className="text-[10px] text-indigo-400/70 shrink-0">{step.time}</span>
                      </div>
                      <p className="text-[10px] text-indigo-400/60 mt-0.5">{step.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="pt-1 border-t border-white/10 flex items-center justify-between">
                <button className="text-xs text-violet-400 font-medium flex items-center gap-1">
                  <svg
                    width="11" height="11" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  חוזה חדש
                </button>
                <span className="text-indigo-400/50 text-[11px]">31 דק׳ מחוזה לתשלום</span>
              </div>

            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
