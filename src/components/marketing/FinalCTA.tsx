import Link from "next/link";

/**
 * FinalCTA — full-width conversion section placed just before MarketingFooter.
 * Server component — no interactivity required.
 *
 * Design: dark indigo/violet gradient with radial glow, big Hebrew headline,
 * single white primary CTA button, trust micro-copy below.
 */
export function FinalCTA() {
  return (
    <section
      dir="rtl"
      className="relative py-24 sm:py-32 overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800"
    >
      {/* Radial violet glow — purely decorative */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="w-[700px] h-[700px] bg-violet-600/20 rounded-full blur-3xl" />
      </div>

      {/* Top separator */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-white/10"
      />

      {/* Content */}
      <div className="relative max-w-3xl mx-auto px-6 text-center flex flex-col items-center gap-8">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-violet-300 uppercase tracking-widest">
          <svg
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          מוכנים להתחיל?
        </span>

        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
          סגרו את העסקה הבאה
          <br className="hidden sm:block" />
          <span className="text-violet-300"> בחכמה יותר.</span>
        </h2>

        {/* Sub-copy */}
        <p className="text-lg sm:text-xl text-indigo-200/80 leading-relaxed max-w-xl">
          הצטרפו לסוכנים שכבר חוסכים שעות בכל עסקה עם SignDeal.
        </p>

        {/* Primary CTA */}
        <Link
          href="/register"
          className="inline-flex items-center justify-center gap-2.5
                     bg-white text-indigo-700 font-bold text-base
                     px-10 py-4 rounded-2xl
                     hover:bg-indigo-50 active:scale-[0.98]
                     transition-all shadow-xl shadow-black/25"
        >
          התחל חינם עכשיו
          <svg
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
            className="rotate-180"
          >
            <polyline points="9 18 3 12 9 6" />
          </svg>
        </Link>

        {/* Trust micro-copy */}
        <p className="text-xs text-indigo-300/60 tracking-wide">
          ללא כרטיס אשראי · ביטול בכל עת · תמיכה בעברית
        </p>
      </div>
    </section>
  );
}
