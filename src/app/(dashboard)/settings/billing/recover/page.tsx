/**
 * /settings/billing/recover — Payment Recovery Page (Phase 4A)
 *
 * Shown to users whose subscription is PAST_DUE or has billing failures (1–2).
 * Explains the problem, shows the current plan, and presents a CTA that
 * initiates a new HYP checkout session to collect a fresh payment method.
 *
 * After HYP processes the card, the user is redirected to /billing/success
 * (portal GoodURL constraint) where activateCheckout detects the recovery
 * path and resets billingFailures to 0 while preserving firstPaymentAt.
 *
 * Server component — no loading spinners, data is ready at render time.
 */

import type { Metadata } from "next";
import { redirect }      from "next/navigation";
import Link              from "next/link";
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { DashboardShell } from "@/components/DashboardShell";
import { RecoveryButton } from "./RecoveryButton";

export const metadata: Metadata = {
  title:  "עדכון אמצעי תשלום | SignDeal",
  robots: { index: false, follow: false },
};

// ── Display helpers ───────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "סטנדרט",
  GROWTH:   "מתקדמת",
  PRO:      "פרו",
};

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "חודשי",
  YEARLY:  "שנתי",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RecoveryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/settings/billing/recover");
  const userId = session.user.id;

  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: {
      plan:            true,
      status:          true,
      billingInterval: true,
      billingFailures: true,
      cardLast4:       true,
    },
  });

  // Redirect to billing settings if no subscription or not eligible.
  if (!sub) redirect("/settings/billing");
  const isEligible = sub.status === "PAST_DUE" || sub.billingFailures >= 1;
  if (!isEligible) redirect("/settings/billing");

  const planLabel     = PLAN_LABELS[sub.plan]              ?? sub.plan;
  const intervalLabel = INTERVAL_LABELS[sub.billingInterval] ?? sub.billingInterval;
  const isPastDue     = sub.status === "PAST_DUE";

  return (
    <DashboardShell>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
        <Link
          href="/settings/billing"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="חזור להגדרות חיוב"
        >
          {/* Chevron right (RTL = back) */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">עדכון אמצעי תשלום</h1>
          <p className="text-sm text-gray-500 mt-0.5">הזן כרטיס פעיל לחידוש הגישה</p>
        </div>
      </header>

      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-lg mx-auto space-y-6">

          {/* ── Status notice ──────────────────────────────────────────────── */}
          {isPastDue ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 flex items-start gap-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9"    x2="12"    y2="13" />
                <line x1="12" y1="17"   x2="12.01" y2="17" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-800">הגישה מושעית — חיוב נכשל</p>
                <p className="text-sm text-red-700 mt-1 leading-relaxed">
                  כל ניסיונות החיוב נכשלו ולא ניתן לגשת לתכונות הפרמיום.
                  עדכן אמצעי תשלום תקף להפעלת המנוי מחדש.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 flex items-start gap-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d97706"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9"    x2="12"    y2="13" />
                <line x1="12" y1="17"   x2="12.01" y2="17" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  ניסיון חיוב נכשל ({sub.billingFailures} מתוך 3)
                </p>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                  עדכן אמצעי תשלום תקף כדי למנוע השעיית הגישה בניסיון הבא.
                </p>
              </div>
            </div>
          )}

          {/* ── Current plan summary ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              פרטי מנוי
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">מסלול</span>
                <span className="text-sm font-semibold text-gray-900">{planLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">מחזור חיוב</span>
                <span className="text-sm font-semibold text-gray-900">{intervalLabel}</span>
              </div>
              {sub.cardLast4 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">כרטיס נוכחי</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    ••••{sub.cardLast4}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── What happens note ───────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 space-y-2 text-xs text-gray-500 leading-relaxed">
            <p>✓ תועבר לעמוד תשלום מאובטח של{" "}
              <span dir="ltr" className="font-medium">HYP Pay</span>.
            </p>
            <p>✓ לאחר אישור הכרטיס — המנוי יחודש ומונה הכשלונות יאופס.</p>
            <p>✓ תאריך חידוש הבא ייקבע מרגע אישור התשלום.</p>
          </div>

          {/* ── CTA ─────────────────────────────────────────────────────────── */}
          <RecoveryButton />

          <p className="text-center text-xs text-gray-400">
            שאלות?{" "}
            <a
              href="mailto:support@signdeal.co.il"
              className="text-indigo-500 hover:underline"
            >
              support@signdeal.co.il
            </a>
          </p>

        </div>
      </main>
    </DashboardShell>
  );
}
