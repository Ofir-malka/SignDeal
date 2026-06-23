/**
 * /billing/success — stub-checkout success + direct-navigation fallback.
 *
 * Real providers no longer land here:
 *   • Grow onboarding            → /billing/grow/success
 *   • Grow card-update / recovery → /billing/grow/payment-method/success
 * The legacy HYP browser-redirect + What=VERIFY activation flow was removed in
 * Cleanup-C2b (HYP checkout was removed in C1, the HYP recurring path in C2a).
 *
 * This route now serves exactly two cases:
 *   1. stub=true     → the StubBillingProvider test flow (/billing/stub-checkout redirects here).
 *   2. anything else → direct navigation → UnknownFlow ("pick a plan").
 */

import type { Metadata } from "next";
import Link              from "next/link";

export const metadata: Metadata = {
  title:  "תוצאת תשלום | SignDeal",
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

// ── Shared page shell ─────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  );
}

// ── Flow A: Stub ──────────────────────────────────────────────────────────────

function StubSuccess({ plan, interval }: { plan: string; interval: string }) {
  const planLabel     = PLAN_LABELS[plan]         ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;

  return (
    <>
      <div className="mx-6 mt-6 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-2.5 flex items-center gap-2.5">
        <span className="text-lg" aria-hidden="true">🧪</span>
        <p className="text-xs font-semibold text-amber-800">
          TEST MODE — תשלום סטאב בלבד. לא בוצע חיוב אמיתי.
        </p>
      </div>

      <div className="bg-emerald-500 mx-6 mt-4 rounded-xl px-5 py-4 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <p className="text-base font-bold">תשלום הבדיקה אושר</p>
            {planLabel && (
              <p className="text-sm text-emerald-100 mt-0.5">מסלול {planLabel}</p>
            )}
          </div>
          <span className="text-3xl" aria-hidden="true">✅</span>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        {(planLabel || intervalLabel) && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex flex-col gap-2">
            {planLabel     && <SummaryRow label="מסלול" value={planLabel} />}
            {intervalLabel && <SummaryRow label="חיוב"  value={intervalLabel} />}
          </div>
        )}
        <p className="text-xs text-center text-gray-400">
          המנוי לא הופעל — זה היה תשלום בדיקה בלבד.
        </p>
        <Link
          href="/dashboard"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          עבור ללוח הבקרה →
        </Link>
      </div>
    </>
  );
}

// ── Direct navigation / unknown ───────────────────────────────────────────────

function UnknownFlow() {
  return (
    <>
      <div className="bg-gray-400 px-6 py-5 text-white">
        <h1 className="text-xl font-bold text-right">דף לאחר תשלום</h1>
      </div>
      <div className="px-6 py-6 flex flex-col gap-4">
        <p className="text-sm text-gray-600 text-center leading-relaxed">
          הגעת לדף זה ישירות. אם ניסית לשלם, חזור לבחירת מסלול ונסה שנית.
        </p>
        <Link
          href="/onboarding/billing"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          בחר מסלול
        </Link>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;

  // Safe string extractor — handles both `"value"` and `["value"]` shapes.
  const sp = (key: string): string => {
    const v = p[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v))      return v[0] ?? "";
    return "";
  };

  // ── Flow A: Stub (local dev / staging test) ───────────────────────────────
  if (sp("stub") === "true") {
    return (
      <PageShell>
        <StubSuccess plan={sp("plan")} interval={sp("interval")} />
      </PageShell>
    );
  }

  // Everything else is direct navigation — no provider redirects to /billing/success
  // anymore (Grow flows use their own bridge pages; HYP was removed).
  return (
    <PageShell>
      <UnknownFlow />
    </PageShell>
  );
}
