import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title:       "SignDeal – ניהול חוזים לסוכני נדל\"ן",
  description: "פלטפורמה לניהול חוזי תיווך, חתימות דיגיטליות וגביית עמלות לסוכני נדל\"ן בישראל.",
  robots:      { index: true, follow: true },
};

/**
 * Public homepage — temporary placeholder.
 *
 * Authenticated users are redirected to /dashboard by proxy.ts before
 * this page renders. This placeholder is shown to unauthenticated visitors
 * until the full marketing homepage is built in a future phase.
 */
export default function HomePage() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 flex flex-col"
    >
      {/* ── Minimal nav ───────────────────────────────────────────────────── */}
      <header className="px-6 py-5 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
            <svg
              width="16" height="16"
              viewBox="0 0 24 24"
              fill="none" stroke="white"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">SignDeal</span>
        </div>

        {/* Auth links */}
        <Link
          href="/login"
          className="text-sm text-white/70 hover:text-white transition-colors"
        >
          התחברות
        </Link>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full text-center space-y-8">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/80 font-medium">בקרוב — הומפאג' מלא</span>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
              חתמו. גבו. סגרו.
            </h1>
            <p className="text-lg text-indigo-200 leading-relaxed">
              פלטפורמה לניהול חוזי תיווך, חתימות דיגיטליות
              וגביית עמלות — הכל במקום אחד.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-semibold text-sm px-7 py-3 rounded-xl hover:bg-indigo-50 active:scale-[0.98] transition-all shadow-lg shadow-black/20"
            >
              התחל חינם
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 5 5 12 12 19" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white font-medium text-sm px-7 py-3 rounded-xl hover:bg-white/15 active:scale-[0.98] transition-all"
            >
              כניסה לחשבון
            </Link>
          </div>

          {/* Trust micro-copy */}
          <p className="text-xs text-indigo-300/70">
            ללא כרטיס אשראי · ביטול בכל עת · תמיכה בעברית
          </p>

        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="px-6 py-5 border-t border-white/10">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/legal/terms"   className="text-xs text-white/40 hover:text-white/70 transition-colors">תנאי שימוש</Link>
          <Link href="/legal/privacy" className="text-xs text-white/40 hover:text-white/70 transition-colors">מדיניות פרטיות</Link>
          <Link href="/legal/cookies" className="text-xs text-white/40 hover:text-white/70 transition-colors">עוגיות</Link>
          <a href="mailto:support@signdeal.co.il" className="text-xs text-white/40 hover:text-white/70 transition-colors">support@signdeal.co.il</a>
        </div>
      </footer>
    </div>
  );
}
