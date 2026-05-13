/**
 * /billing/stub-checkout
 *
 * TEST MODE ONLY — rendered when BILLING_PROVIDER=stub.
 * No real charge occurs. No card data is collected.
 *
 * Displays the selected plan + interval, then lets the tester confirm
 * the "payment" which redirects to /billing/success with stub=true.
 */

import type { Metadata } from "next";
import Link              from "next/link";
import { redirect }      from "next/navigation";

export const metadata: Metadata = {
  title:  "TEST — Stub Checkout | SignDeal",
  robots: { index: false, follow: false },
};

// ── Plan display data ─────────────────────────────────────────────────────────

const VALID_PLANS    = ["STANDARD", "GROWTH", "PRO"] as const;
const VALID_INTERVALS = ["MONTHLY", "YEARLY"]        as const;

type ValidPlan     = (typeof VALID_PLANS)[number];
type ValidInterval = (typeof VALID_INTERVALS)[number];

const PLAN_LABELS: Record<ValidPlan, string> = {
  STANDARD: "סטנדרט",
  GROWTH:   "מתקדמת",
  PRO:      "פרו",
};

// Prices in NIS — kept in sync with src/lib/plans.ts
const PLAN_PRICES: Record<ValidPlan, { monthly: number; yearly: number; yearlyTotal: number }> = {
  STANDARD: { monthly: 39, yearly: 29,  yearlyTotal: 348  },
  GROWTH:   { monthly: 49, yearly: 39,  yearlyTotal: 468  },
  PRO:      { monthly: 110, yearly: 99, yearlyTotal: 1188 },
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function StubCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params   = await searchParams;
  const plan     = params.plan     as ValidPlan;
  const interval = params.interval as ValidInterval;

  // Guard: invalid params → back to pricing
  if (!VALID_PLANS.includes(plan) || !VALID_INTERVALS.includes(interval)) {
    redirect("/pricing");
  }

  const prices    = PLAN_PRICES[plan];
  const isYearly  = interval === "YEARLY";
  const pricePerMonth = isYearly ? prices.yearly : prices.monthly;

  // Confirm button href — stub=true signals the success page this was a test
  const confirmHref =
    `/billing/success?stub=true&plan=${plan}&interval=${interval}`;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16"
    >
      {/* ── TEST MODE banner ── */}
      <div className="w-full max-w-md mb-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-5 py-3 flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">🧪</span>
        <div>
          <p className="text-sm font-bold text-amber-800 uppercase tracking-wide">
            TEST MODE — STUB ONLY
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            אין חיוב אמיתי. אין שמירת פרטי כרטיס. דף זה גלוי רק כאשר{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">BILLING_PROVIDER=stub</code>.
          </p>
        </div>
      </div>

      {/* ── Checkout card ── */}
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Header */}
        <div className="bg-indigo-600 px-6 py-5 text-white text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">
            SignDeal — סיום הצטרפות
          </p>
          <h1 className="text-xl font-bold">
            מסלול {PLAN_LABELS[plan]}
          </h1>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">

          {/* Plan summary */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">תדירות חיוב</span>
              <span className="text-sm font-semibold text-gray-800">
                {isYearly ? "שנתי" : "חודשי"}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-gray-500">מחיר</span>
              <span className="text-sm font-semibold text-gray-800">
                ₪{pricePerMonth} / חודש
                {isYearly && (
                  <span className="text-xs font-normal text-gray-400 mr-1">
                    (סה״כ ₪{prices.yearlyTotal} / שנה)
                  </span>
                )}
              </span>
            </div>
            {isYearly && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-500">חסכון</span>
                <span className="text-sm font-semibold text-emerald-600">
                  ₪{(prices.monthly - prices.yearly) * 12} לשנה
                </span>
              </div>
            )}
          </div>

          {/* Stub notice */}
          <p className="text-xs text-center text-gray-400 leading-relaxed">
            בסביבת בדיקה — לחיצה על הכפתור מדמה תשלום מוצלח.
            <br />
            לא מועברים פרטי כרטיס אשראי.
          </p>

          {/* Confirm button */}
          <Link
            href={confirmHref}
            className="w-full text-center text-sm font-bold py-3.5 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700
                       transition-colors active:scale-[0.98]"
          >
            אשר תשלום בדיקה ✓
          </Link>

          {/* Cancel link */}
          <Link
            href="/pricing"
            className="text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← חזור לדף המחירים
          </Link>

        </div>
      </div>

      {/* Bottom label */}
      <p className="mt-6 text-xs text-gray-300 font-mono">
        BILLING_PROVIDER=stub · no real charge · test only
      </p>
    </div>
  );
}
