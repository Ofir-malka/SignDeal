import Link from "next/link";
import type { Metadata } from "next";

// Legal pages are the only publicly-indexable pages in the app.
export const metadata: Metadata = {
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2 group">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900 text-[16px] tracking-tight group-hover:text-indigo-700 transition-colors">
              SignDeal
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-gray-500">
            <Link href="/legal/terms"   className="hover:text-gray-900 transition-colors">תנאי שימוש</Link>
            <Link href="/legal/privacy" className="hover:text-gray-900 transition-colors">פרטיות</Link>
            <Link href="/legal/cookies" className="hover:text-gray-900 transition-colors">עוגיות</Link>
          </nav>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {children}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} SignDeal. כל הזכויות שמורות.</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            <Link href="/legal/terms"   className="text-xs text-gray-400 hover:text-gray-700 transition-colors">תנאי שימוש</Link>
            <Link href="/legal/privacy" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">מדיניות פרטיות</Link>
            <Link href="/legal/cookies" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">מדיניות עוגיות</Link>
            <a
              href="mailto:support@signdeal.co.il"
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              support@signdeal.co.il
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
