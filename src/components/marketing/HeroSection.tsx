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
 * Server component — AnimateIn (client) handles entrance animations.
 * Mock UI is decorative (aria-hidden) and uses the float keyframe
 * defined in globals.css.
 */
export function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden
                 bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 pt-16"
    >
      {/* ── Background radial glow ─────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      >
        <div className="w-[700px] h-[700px] bg-violet-600/15 rounded-full blur-3xl" />
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="relative max-w-6xl mx-auto px-6 py-20 sm:py-24
                   flex flex-col lg:flex-row items-center gap-14 lg:gap-20"
      >

        {/* Text column */}
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
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
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

          {/* Subheadline — describes the full end-to-end workflow */}
          <AnimateIn delay={200}>
            <p className="text-lg sm:text-xl text-indigo-200 leading-relaxed max-w-lg">
              SignDeal בונה את החוזה, שולח לחתימה ב-SMS, ומאפשר ללקוח
              לשלם את העמלה ישירות מהנייד — בלי ניירת, בלי מרדף.
            </p>
          </AnimateIn>

          {/* CTAs */}
          <AnimateIn delay={300}>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center
                           bg-white text-indigo-700 font-semibold text-sm
                           px-7 py-3.5 rounded-xl
                           hover:bg-indigo-50 active:scale-[0.98]
                           transition-all shadow-lg shadow-black/20"
              >
                התחל חינם — ללא כרטיס אשראי
              </Link>
              <a
                href="#how"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2
                           bg-white/10 border border-white/20 text-white font-medium text-sm
                           px-7 py-3.5 rounded-xl
                           hover:bg-white/15 active:scale-[0.98]
                           transition-all"
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

          {/* 3-stat mini strip — concrete workflow proof-points */}
          <AnimateIn delay={400}>
            <div
              dir="rtl"
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2"
            >
              {(
                [
                  {
                    label: "3 דקות לחוזה",
                    icon: (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ),
                  },
                  {
                    label: "חתימה ב-SMS",
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
                    icon: (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    ),
                  },
                ] as const
              ).map(({ label, icon }, i) => (
                <span key={label} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span
                      className="w-1 h-1 rounded-full bg-indigo-500/50 mx-0.5"
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-violet-400 flex-shrink-0">{icon}</span>
                  <span className="text-sm font-medium text-indigo-200/80">{label}</span>
                </span>
              ))}
            </div>
          </AnimateIn>

          {/* Micro trust-copy */}
          <AnimateIn delay={500}>
            <p className="text-xs text-indigo-300/50">
              ללא כרטיס אשראי · ביטול בכל עת · תמיכה בעברית
            </p>
          </AnimateIn>
        </div>

        {/* Mock UI column */}
        <div className="flex-1 w-full max-w-sm lg:max-w-md">
          <AnimateIn delay={250} from="left">
            <DashboardMock />
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Decorative dashboard preview — pure Tailwind, no real data.
   Float keyframe defined in globals.css.
───────────────────────────────────────────────────────────────────────── */

const MOCK_ROWS = [
  {
    name:     "יוסי כהן",
    property: "דירה ברחוב הרצל 12",
    amount:   "₪8,500",
    status:   "ממתין לחתימה",
    badge:    "bg-amber-400/20 text-amber-300 border-amber-400/30",
  },
  {
    name:     "מיכל לוי",
    property: "משרד בתל אביב",
    amount:   "₪12,000",
    status:   "שולם ✓",
    badge:    "bg-emerald-400/20 text-emerald-300 border-emerald-400/30",
  },
  {
    name:     "דוד אברהם",
    property: "דירת 4 חדרים, ירושלים",
    amount:   "₪9,200",
    status:   "נחתם",
    badge:    "bg-violet-400/20 text-violet-300 border-violet-400/30",
  },
] as const;

function DashboardMock() {
  return (
    <div
      aria-hidden="true"
      className="animate-[float_4s_ease-in-out_infinite] will-change-transform"
    >
      <GlassCard variant="elevated" className="p-5 space-y-4 shadow-2xl shadow-black/40">

        {/* Card header */}
        <div className="flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-md flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-white text-xs font-semibold">SignDeal</span>
          </div>
          <span className="text-indigo-300/70 text-xs">3 חוזים פעילים</span>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Contract rows */}
        <div className="space-y-2.5" dir="rtl">
          {MOCK_ROWS.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 gap-3
                         hover:bg-white/8 transition-colors"
            >
              {/* Left: name + property */}
              <div className="min-w-0 flex-1 text-right">
                <p className="text-white text-xs font-semibold truncate">{row.name}</p>
                <p className="text-indigo-300/60 text-[11px] truncate">{row.property}</p>
              </div>

              {/* Right: status + amount */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${row.badge}`}>
                  {row.status}
                </span>
                <span className="text-white/50 text-[11px]">{row.amount}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Card footer action */}
        <div className="flex items-center justify-between pt-1 border-t border-white/10" dir="rtl">
          <button className="text-xs text-violet-400 font-medium flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            חוזה חדש
          </button>
          <span className="text-indigo-400/50 text-[11px]">עודכן כרגע</span>
        </div>
      </GlassCard>
    </div>
  );
}
