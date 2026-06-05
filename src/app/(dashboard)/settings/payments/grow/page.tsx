/**
 * /settings/payments/grow — Grow clearing connection status (Rail B migration target).
 *
 * Server component: auth-gates, renders the layout shell, and reads ?submitted=1
 * (set when returning from the dedicated onboarding screen) to pass an optimistic
 * "pending" hint to <GrowConnectionCard />, which loads live status from
 * GET /api/grow/onboarding/status. Does NOT alter the Stripe flow at /settings/payments.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";
import { GrowConnectionCard } from "./GrowConnectionCard";

export const metadata: Metadata = {
  title: "חיבור לסליקת Grow | SignDeal",
  robots: { index: false, follow: false },
};

export default async function GrowConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/settings/payments/grow");

  const { submitted } = await searchParams;
  const initialSubmitted = submitted === "1";

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
          <h1 className="text-xl font-bold text-gray-900">חיבור לסליקת Grow</h1>
          <p className="text-sm text-gray-500 mt-0.5">סטטוס חיבור חשבון הסליקה שלך ל-Grow</p>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-lg mx-auto space-y-6">
          <GrowConnectionCard initialSubmitted={initialSubmitted} />
        </div>
      </main>
    </DashboardShell>
  );
}
