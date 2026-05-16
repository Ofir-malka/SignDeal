"use client";

/**
 * /onboarding/billing
 *
 * Billing onboarding page — shown to all new users (INCOMPLETE status).
 * The user picks a plan and billing interval, then is redirected to the
 * HYP hosted payment page to provide card details.
 *
 * Key messaging:
 *   • 14-day free trial starts AFTER card is approved
 *   • No charge today
 *   • Cancel any time
 *
 * After the user provides a card, HYP redirects to /billing/success,
 * which activates the subscription and sets trialEndsAt.
 *
 * This page intentionally does NOT use DashboardShell — INCOMPLETE users
 * have no access to the dashboard layout.
 */

import { useState }         from "react";
import { signOut }          from "next-auth/react";

// ── Plan data ─────────────────────────────────────────────────────────────────

type BillablePlan = "STANDARD" | "GROWTH" | "PRO";
type Period       = "monthly" | "yearly";

interface PlanData {
  id:            BillablePlan;
  name:          string;
  monthlyPrice:  number;
  yearlyMonthly: number;
  yearlyTotal:   number;
  yearlySaving:  number;
  docsPerMonth:  number;
  highlighted:   boolean;
  features:      string[];
}

const PLANS: PlanData[] = [
  {
    id:            "STANDARD",
    name:          "סטנדרט",
    monthlyPrice:  39,
    yearlyMonthly: 29,
    yearlyTotal:   348,
    yearlySaving:  120,
    docsPerMonth:  30,
    highlighted:   false,
    features:      ["30 חוזים / חודש", "חתימות דיגיטליות", "גביית עמלות", "תמיכה בדוא\"ל"],
  },
  {
    id:            "GROWTH",
    name:          "מתקדמת",
    monthlyPrice:  49,
    yearlyMonthly: 39,
    yearlyTotal:   468,
    yearlySaving:  120,
    docsPerMonth:  60,
    highlighted:   false,
    features:      ["60 חוזים / חודש", "חתימות דיגיטליות", "גביית עמלות", "תמיכה בדוא\"ל"],
  },
  {
    id:            "PRO",
    name:          "פרו",
    monthlyPrice:  110,
    yearlyMonthly: 99,
    yearlyTotal:   1_188,
    yearlySaving:  132,
    docsPerMonth:  100,
    highlighted:   true,
    features:      ["100 חוזים / חודש", "חתימות דיגיטליות", "גביית עמלות", "תמיכה עדיפות"],
  },
];

// ── Plan card sub-component ───────────────────────────────────────────────────

function PlanCard({
  plan,
  period,
  loadingPlan,
  onSelect,
}: {
  plan:        PlanData;
  period:      Period;
  loadingPlan: BillablePlan | null;
  onSelect:    (plan: BillablePlan, interval: "MONTHLY" | "YEARLY") => void;
}) {
  const price    = period === "yearly" ? plan.yearlyMonthly : plan.monthlyPrice;
  const interval = period === "yearly" ? "YEARLY" : "MONTHLY";
  const isLoading = loadingPlan === plan.id;
  const isDisabled = loadingPlan !== null;

  return (
    <div
      className={[
        "relative flex flex-col rounded-2xl border p-6 gap-5 transition-all",
        plan.highlighted
          ? "border-indigo-300 bg-indigo-50 shadow-md shadow-indigo-100"
          : "border-gray-200 bg-white shadow-sm",
      ].join(" ")}
    >
      {/* Popular badge */}
      {plan.highlighted && (
        <span className="absolute -top-3 right-5 text-[11px] font-bold px-3 py-0.5 rounded-full bg-indigo-600 text-white shadow">
          הכי פופולרי
        </span>
      )}

      {/* Plan name + docs */}
      <div>
        <p className="font-bold text-gray-900 text-lg">{plan.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">עד {plan.docsPerMonth} חוזים / חודש</p>
      </div>

      {/* Price */}
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black text-gray-900">₪{price}</span>
          <span className="text-sm text-gray-400">/ חודש</span>
        </div>
        {period === "yearly" && (
          <p className="text-xs text-gray-400 mt-1">
            חיוב שנתי — ₪{plan.yearlyTotal}{" "}
            <span className="text-emerald-600 font-medium">· חסכון ₪{plan.yearlySaving}</span>
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-1.5 text-sm text-gray-600 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => onSelect(plan.id, interval)}
        className={[
          "w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          plan.highlighted
            ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow shadow-indigo-200"
            : "bg-gray-900 hover:bg-gray-800 text-white",
        ].join(" ")}
      >
        {isLoading ? "פותח עמוד תשלום..." : "בחר מסלול"}
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingBillingPage() {
  const [period,      setPeriod]      = useState<Period>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<BillablePlan | null>(null);
  const [error,       setError]       = useState<string>("");

  async function handleSelectPlan(plan: BillablePlan, interval: "MONTHLY" | "YEARLY") {
    setError("");
    setLoadingPlan(plan);
    try {
      const res  = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan, interval }),
      });
      const data = await res.json() as { checkoutUrl?: string; error?: string };

      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "שגיאה בפתיחת עמוד התשלום — נסה שנית");
        return;
      }

      // Full navigation to HYP hosted payment page.
      window.location.assign(data.checkoutUrl);
    } catch {
      setError("שגיאת רשת — בדוק חיבור לאינטרנט ונסה שנית");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl">

        {/* Logo */}
        <div className="flex items-center justify-between mb-10">
          <div className="inline-flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
              ✓
            </div>
            <span className="text-xl font-bold text-gray-900">SignDeal</span>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            התנתק
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gray-900">בחר מסלול והתחל ניסיון חינם</h1>
          <p className="text-gray-500 mt-3 text-base leading-relaxed">
            14 יום ניסיון חינם · לא יחויב היום · ביטול בכל עת
          </p>
        </div>

        {/* Trust banner */}
        <div className="flex flex-wrap justify-center gap-6 mb-8 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            תשלום מאובטח
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            הניסיון מתחיל רק לאחר אישור הכרטיס
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            אין חיוב היום
          </span>
        </div>

        {/* Period toggle */}
        <div className="flex justify-center mb-8">
          <div
            role="group"
            aria-label="תקופת חיוב"
            className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1"
          >
            {(["monthly", "yearly"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={[
                  "text-sm font-semibold px-5 py-2 rounded-lg transition-all flex items-center gap-2",
                  period === p
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-800",
                ].join(" ")}
              >
                {p === "monthly" ? "חודשי" : "שנתי"}
                {p === "yearly" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    עד 25% הנחה
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              period={period}
              loadingPlan={loadingPlan}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center mb-4">
            {error}
          </div>
        )}

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-gray-200 px-6 py-5 mb-6">
          <p className="text-sm font-semibold text-gray-900 mb-3">איך זה עובד?</p>
          <ol className="space-y-2 text-sm text-gray-600 list-none">
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">1</span>
              <span>בחר מסלול והזן פרטי כרטיס — לא יחויב היום.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">2</span>
              <span>ניסיון חינם של 14 יום מתחיל מיד לאחר אישור הכרטיס.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">3</span>
              <span>לאחר 14 יום מחויב המסלול שבחרת. ניתן לבטל בכל עת.</span>
            </li>
          </ol>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          המחירים לא כוללים מע״מ. חיוב שנתי מחויב בתשלום אחד מראש.
          ביטול אפשרי בכל עת לפני תחילת תקופת החיוב הבאה.
        </p>

      </div>
    </main>
  );
}
