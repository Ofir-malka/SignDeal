/**
 * /settings/payments/grow/onboarding — dedicated full-page Grow onboarding screen.
 *
 * Server component: auth-gates and renders the layout shell (keeps the dashboard
 * sidebar/header). The Grow iframe + hand-off live in <GrowOnboardingScreen />,
 * which reads { sessionId, formUrl } from sessionStorage (never the URL/DB).
 *
 * Stays inside SignDeal — no external redirect, no new tab, no modal.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";
import { GrowOnboardingScreen } from "./GrowOnboardingScreen";

export const metadata: Metadata = {
  title: "הרשמה ל-Grow | SignDeal",
  robots: { index: false, follow: false },
};

export default async function GrowOnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/settings/payments/grow/onboarding");

  return (
    <DashboardShell>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
        <Link
          href="/settings/payments/grow"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="חזרה לחיבור Grow"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">הרשמה ל-Grow</h1>
          <p className="text-sm text-gray-500 mt-0.5">השלמת טופס ההרשמה המאובטח של Grow</p>
        </div>
      </header>

      {/* ── Content (large area for the Grow form) ──────────────────────────── */}
      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <GrowOnboardingScreen />
      </main>
    </DashboardShell>
  );
}
