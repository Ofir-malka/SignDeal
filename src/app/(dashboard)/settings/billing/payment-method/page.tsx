/**
 * /settings/billing/payment-method — Payment Method Update Page (Phase 4B)
 *
 * For ACTIVE or TRIALING users who want to change their stored card without
 * any billing disruption. This is NOT the recovery flow:
 *
 *   Recovery  (/settings/billing/recover)     → PAST_DUE / billingFailures ≥ 1
 *   PMU       (/settings/billing/payment-method) → ACTIVE / TRIALING, healthy
 *
 * After HYP processes the card, the user is redirected to /billing/success
 * which detects purpose="payment_method_update" and updates card fields only —
 * status, billingFailures, firstPaymentAt, nextBillingAt, and the billing period
 * are all left unchanged.
 *
 * Server component — data ready at render time, no loading spinners.
 */

import type { Metadata } from "next";
import { redirect }      from "next/navigation";
import Link              from "next/link";
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { DashboardShell }     from "@/components/DashboardShell";
import { UpdatePaymentButton } from "./UpdatePaymentButton";

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

export default async function PaymentMethodPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/settings/billing/payment-method");
  const userId = session.user.id;

  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: {
      plan:            true,
      status:          true,
      billingInterval: true,
      billingFailures: true,
      cardLast4:       true,
      cardExpMonth:    true,
      cardExpYear:     true,
    },
  });

  // Redirect if no subscription.
  if (!sub) redirect("/settings/billing");

  // PAST_DUE → use recovery flow instead.
  if (sub.status === "PAST_DUE") redirect("/settings/billing/recover");

  // Not ACTIVE or TRIALING → can't self-serve update card.
  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") redirect("/settings/billing");

  const planLabel     = PLAN_LABELS[sub.plan]              ?? sub.plan;
  const intervalLabel = INTERVAL_LABELS[sub.billingInterval] ?? sub.billingInterval;
  const hasCard       = Boolean(sub.cardLast4);

  // Card expiry display: "MM/YYYY"
  const cardExpiry =
    sub.cardExpMonth && sub.cardExpYear
      ? `${String(sub.cardExpMonth).padStart(2, "0")}/${sub.cardExpYear}`
      : null;

  return (
    <DashboardShell>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
        <Link
          href="/settings/billing"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="חזור להגדרות חיוב"
        >
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
          <h1 className="text-xl font-bold text-gray-900">
            {hasCard ? "החלפת אמצעי תשלום" : "הוספת אמצעי תשלום"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {hasCard ? "עדכן את הכרטיס המשויך למנוי שלך" : "הוסף כרטיס לאימות חשבון"}
          </p>
        </div>
      </header>

      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-lg mx-auto space-y-6">

          {/* ── Current card (if exists) ────────────────────────────────────── */}
          {hasCard && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                כרטיס נוכחי
              </p>
              <div className="flex items-center gap-4">
                {/* Generic card icon */}
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                    className="text-gray-500" aria-hidden="true">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">
                    ••••&nbsp;{sub.cardLast4}
                  </p>
                  {cardExpiry && (
                    <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                      תוקף: {cardExpiry}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Subscription context ────────────────────────────────────────── */}
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">סטטוס</span>
                <span className={`text-sm font-semibold ${
                  sub.status === "ACTIVE"   ? "text-emerald-700" :
                  sub.status === "TRIALING" ? "text-blue-700"    : "text-gray-900"
                }`}>
                  {sub.status === "ACTIVE" ? "פעיל" : sub.status === "TRIALING" ? "בניסיון חינם" : sub.status}
                </span>
              </div>
            </div>
          </div>

          {/* ── What happens ────────────────────────────────────────────────── */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 space-y-2 text-xs text-gray-500 leading-relaxed">
            <p>✓ תועבר לעמוד תשלום מאובטח של{" "}
              <span dir="ltr" className="font-medium">HYP Pay</span>.
            </p>
            <p>✓ הכרטיס יאומת בלבד — לא יבוצע חיוב עכשיו.</p>
            <p>✓ לאחר האימות הכרטיס החדש ישמש לחיוב הבא בלבד.</p>
            <p>✓ מועד החיוב הבא, הסטטוס, ותאריכי המנוי לא ישתנו.</p>
          </div>

          {/* ── CTA ─────────────────────────────────────────────────────────── */}
          <UpdatePaymentButton hasCard={hasCard} />

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
