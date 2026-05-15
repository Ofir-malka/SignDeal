"use client";

/**
 * BillingUpgradeSection
 *
 * Client component rendered inside /settings/billing (server component).
 * Owns the period toggle state and renders plan upgrade cards.
 *
 * Props:
 *   currentPlan  — the plan stored on the subscription (used to badge the current plan)
 *   isActive     — true when subscription.status === "ACTIVE" (paid, not just trialing)
 *
 * Plan hierarchy: STANDARD < GROWTH < PRO
 * AGENCY is contact-sales only and has no checkout CTA.
 */

import { useState } from "react";
import { PlanUpgradeButton } from "@/components/PlanUpgradeButton";

type BillablePlan = "STANDARD" | "GROWTH" | "PRO";
type Period       = "monthly"  | "yearly";

interface UpgradePlan {
  id:            BillablePlan;
  name:          string;
  monthlyPrice:  number;
  yearlyMonthly: number;
  yearlyTotal:   number;
  yearlySaving:  number;
  docsPerMonth:  number;
  highlighted:   boolean;
}

const PLANS: UpgradePlan[] = [
  {
    id:            "STANDARD",
    name:          "סטנדרט",
    monthlyPrice:  39,
    yearlyMonthly: 29,
    yearlyTotal:   348,
    yearlySaving:  120,
    docsPerMonth:  30,
    highlighted:   false,
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
  },
];

const INPUT_BASE =
  "text-sm font-semibold px-5 py-2 rounded-lg transition-all flex items-center gap-2";

interface Props {
  currentPlan: string;   // PlanType value from DB
  isActive:    boolean;  // subscription.status === "ACTIVE"
}

export function BillingUpgradeSection({ currentPlan, isActive }: Props) {
  const [period, setPeriod] = useState<Period>("monthly");

  return (
    <div dir="rtl" className="space-y-6">

      {/* Period toggle */}
      <div className="flex justify-center sm:justify-start">
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
                INPUT_BASE,
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = isActive && plan.id === currentPlan;
          const price     = period === "yearly" ? plan.yearlyMonthly : plan.monthlyPrice;
          const interval  = period === "yearly" ? "YEARLY" : "MONTHLY";

          return (
            <div
              key={plan.id}
              className={[
                "relative flex flex-col rounded-2xl border p-5 gap-4 transition-all",
                plan.highlighted
                  ? "border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-100"
                  : "border-gray-200 bg-white",
                isCurrent ? "ring-2 ring-indigo-400" : "",
              ].join(" ")}
            >
              {/* Popular badge */}
              {plan.highlighted && !isCurrent && (
                <span className="absolute -top-3 right-4 text-[11px] font-bold px-3 py-0.5 rounded-full bg-indigo-600 text-white shadow">
                  הכי פופולרי
                </span>
              )}

              {/* Current plan badge */}
              {isCurrent && (
                <span className="absolute -top-3 right-4 text-[11px] font-bold px-3 py-0.5 rounded-full bg-emerald-600 text-white shadow">
                  מסלול פעיל
                </span>
              )}

              {/* Plan name + doc limit */}
              <div>
                <p className="font-bold text-gray-900">{plan.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">עד {plan.docsPerMonth} חוזים / חודש</p>
              </div>

              {/* Price */}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-gray-900">₪{price}</span>
                  <span className="text-sm text-gray-400">/ חודש</span>
                </div>
                {period === "yearly" && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    חיוב שנתי — סה״כ ₪{plan.yearlyTotal}
                    {" · "}
                    <span className="text-emerald-600 font-medium">חסכון ₪{plan.yearlySaving}</span>
                  </p>
                )}
              </div>

              {/* CTA */}
              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 cursor-default"
                >
                  מסלול פעיל
                </button>
              ) : (
                <PlanUpgradeButton
                  plan={plan.id}
                  interval={interval}
                  label={currentPlan === "STANDARD" || !isActive ? "בחר מסלול" : "שדרג"}
                  className={[
                    "w-full py-2.5 rounded-xl text-sm font-semibold",
                    "transition-all active:scale-[0.98]",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    plan.highlighted
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow shadow-indigo-200"
                      : "bg-gray-900 hover:bg-gray-800 text-white",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* AGENCY contact row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5">
        <div>
          <p className="font-bold text-gray-900">AGENCY — לסוכנויות ורשתות תיווך</p>
          <p className="text-sm text-gray-500 mt-0.5">חוזים ללא הגבלה, ניהול מרובה סוכנים, SLA ייעודי, API מלא.</p>
        </div>
        <a
          href="mailto:support@signdeal.co.il?subject=בקשת%20מסלול%20AGENCY"
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          צור קשר
        </a>
      </div>

    </div>
  );
}
