/**
 * /billing/success
 *
 * Post-payment success landing page.
 * Shown after HYP (or stub) redirects back to SignDeal.
 *
 * ⚠️  DB NOT updated here — subscription update is the webhook handler's job.
 *     This page is UX only: reassure the user the payment was received and
 *     point them to the dashboard.
 *
 * Query params (all optional):
 *   stub=true    — came from stub checkout (shows extra test label)
 *   plan         — plan selected (STANDARD | GROWTH | PRO)
 *   interval     — billing interval (MONTHLY | YEARLY)
 */

import type { Metadata } from "next";
import Link              from "next/link";

export const metadata: Metadata = {
  title:  "תשלום התקבל | SignDeal",
  robots: { index: false, follow: false },
};

// ── Plan display helpers ──────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "סטנדרט",
  GROWTH:   "מתקדמת",
  PRO:      "פרו",
};

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "חודשי",
  YEARLY:  "שנתי",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ stub?: string; plan?: string; interval?: string }>;
}) {
  const params   = await searchParams;
  const isStub   = params.stub === "true";
  const plan     = params.plan     ?? "";
  const interval = params.interval ?? "";

  const planLabel     = PLAN_LABELS[plan]     ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16"
    >
      {/* Stub mode badge */}
      {isStub && (
        <div className="w-full max-w-md mb-6 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-5 py-2.5 flex items-center gap-2.5">
          <span className="text-lg" aria-hidden="true">🧪</span>
          <p className="text-xs font-semibold text-amber-800">
            TEST MODE — תשלום סטאב בלבד. לא בוצע חיוב אמיתי.
          </p>
        </div>
      )}

      {/* Success card */}
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Green top strip */}
        <div className="bg-emerald-500 px-6 py-5 text-white text-right">
          <div className="flex items-center gap-3 justify-end">
            <div>
              <h1 className="text-xl font-bold">התשלום התקבל!</h1>
              <p className="text-sm text-emerald-100 mt-0.5">
                ברוכים הבאים למסלול{planLabel ? ` ${planLabel}` : ""}.
              </p>
            </div>
            <span className="text-4xl" aria-hidden="true">✅</span>
          </div>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">

          {/* Summary row */}
          {planLabel && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-4">
              {planLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">מסלול</span>
                  <span className="text-sm font-semibold text-gray-800">{planLabel}</span>
                </div>
              )}
              {intervalLabel && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-500">חיוב</span>
                  <span className="text-sm font-semibold text-gray-800">{intervalLabel}</span>
                </div>
              )}
            </div>
          )}

          {/* Message */}
          <p className="text-sm text-gray-600 leading-relaxed text-center">
            המנוי יופעל תוך מספר רגעים.
            <br />
            אם המנוי לא מופעל תוך דקה, רענן את הדף.
          </p>

          {/* Dashboard CTA */}
          <Link
            href="/dashboard"
            className="w-full text-center text-sm font-bold py-3.5 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700
                       transition-colors active:scale-[0.98]"
          >
            עבור ללוח הבקרה →
          </Link>

          {/* Support note */}
          <p className="text-center text-xs text-gray-400 leading-relaxed">
            שאלות? פנו אלינו בכתובת{" "}
            <a
              href="mailto:support@signdeal.co.il"
              className="text-indigo-500 hover:underline"
            >
              support@signdeal.co.il
            </a>
          </p>

        </div>
      </div>
    </div>
  );
}
