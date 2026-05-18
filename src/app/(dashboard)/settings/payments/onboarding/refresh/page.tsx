/**
 * /settings/payments/onboarding/refresh
 *
 * Stripe's refresh_url — the page Stripe redirects the broker to when the
 * Account Link has expired (~10 min TTL on Stripe-hosted onboarding links).
 *
 * Also reached when the broker navigates back to a stale link, or when Stripe
 * otherwise determines the link can no longer be used.
 *
 * Shows a clear "link expired" message and a RefreshButton that calls
 * POST /api/stripe/connect/refresh to generate a fresh Account Link without
 * creating a new Stripe account.
 */

import type { Metadata }  from "next";
import { redirect }       from "next/navigation";
import Link               from "next/link";
import { auth }           from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";
import { RefreshButton }  from "./RefreshButton";

export const metadata: Metadata = {
  title:  "קישור ההרשמה פג | SignDeal",
  robots: { index: false, follow: false },
};

export default async function OnboardingRefreshPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/settings/payments/onboarding/refresh");
  }

  return (
    <DashboardShell>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
        <Link
          href="/settings/payments"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="חזרה לקבלת תשלומים"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">קישור ההרשמה פג תוקף</h1>
          <p className="text-sm text-gray-500 mt-0.5">צור קישור הרשמה חדש להמשך</p>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-lg mx-auto space-y-6">

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
            {/* Warning icon */}
            <div className="flex justify-center mb-5">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                <svg
                  width="26" height="26" viewBox="0 0 24 24"
                  fill="none" stroke="#d97706" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9"  x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>

            <h2 className="text-base font-semibold text-gray-900 text-center mb-2">
              קישור ההרשמה ל-Stripe פג תוקף
            </h2>
            <p className="text-sm text-gray-600 text-center leading-relaxed mb-5">
              קישורי הרשמה ל-Stripe תקפים לכ-10 דקות בלבד.
              <br />
              ניתן לצור קישור חדש בכפתור למטה — הנתונים שהזנת כבר שמורים ב-Stripe.
            </p>

            <RefreshButton />
          </div>

          <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 text-xs text-gray-500 leading-relaxed">
            קישור חדש ייצור על גבי אותו חשבון Stripe שנוצר קודם — לא ייפתח חשבון חדש.
            אם חוזרים לאיפוס מלא, פנה לתמיכה.
          </div>

        </div>
      </main>
    </DashboardShell>
  );
}
