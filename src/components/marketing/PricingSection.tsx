"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * Pricing section — 3 tiers with monthly/yearly toggle (visual only).
 * id="pricing" matches the #pricing anchor in NavBar.
 *
 * Prices are aspirational/indicative. A disclaimer is shown below the grid.
 * All CTAs go to /register (no billing logic yet).
 */

type Period = "monthly" | "yearly";

/* ── Feature row ── */
interface Feature {
  text: string;
  included: boolean;
}

/* ── Plan definition ── */
interface Plan {
  name: string;
  tagline: string;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlySaving?: string;
  description: string;
  cta: string;
  ctaHref: string;
  ctaExternal?: boolean;
  highlighted: boolean;
  badge?: string;
  features: Feature[];
}

const PLANS: Plan[] = [
  {
    name:         "Starter",
    tagline:      "חינם לתמיד",
    monthlyPrice: "חינם",
    yearlyPrice:  "חינם",
    description:  "לסוכן שרוצה להתחיל",
    cta:          "התחל חינם",
    ctaHref:      "/register",
    highlighted:  false,
    features: [
      { text: "עד 3 חוזים פעילים",         included: true  },
      { text: "חתימה אלקטרונית",           included: true  },
      { text: "לוח בקרה בסיסי",            included: true  },
      { text: "תמיכה בדוא״ל",              included: true  },
      { text: "תזכורות SMS/WhatsApp",      included: false },
      { text: "בקשות תשלום",               included: false },
      { text: "ניהול לקוחות מתקדם",        included: false },
    ],
  },
  {
    name:         "Pro",
    tagline:      "לסוכן שסוגר עסקאות",
    monthlyPrice: "₪199",
    yearlyPrice:  "₪1,990",
    yearlySaving: "חסכון ₪398",
    description:  "הכל שצריך, ללא הגבלות",
    cta:          "נסו Pro — 14 יום חינם",
    ctaHref:      "/register",
    highlighted:  true,
    badge:        "הכי פופולרי",
    features: [
      { text: "חוזים ללא הגבלה",           included: true },
      { text: "חתימה אלקטרונית",           included: true },
      { text: "לוח בקרה מלא",              included: true },
      { text: "תמיכה בעדיפות",             included: true },
      { text: "תזכורות SMS ו-WhatsApp",    included: true },
      { text: "בקשות תשלום",               included: true },
      { text: "ניהול לקוחות מתקדם",        included: true },
    ],
  },
  {
    name:         "Enterprise",
    tagline:      "לסוכנויות ורשתות",
    monthlyPrice: "צור קשר",
    yearlyPrice:  "צור קשר",
    description:  "פתרון מותאם לארגון שלכם",
    cta:          "דברו איתנו",
    ctaHref:      "mailto:support@signdeal.co.il",
    ctaExternal:  true,
    highlighted:  false,
    features: [
      { text: "הכל ב-Pro",                 included: true },
      { text: "משתמשים מרובים",            included: true },
      { text: "API ו-Webhooks",            included: true },
      { text: "מנהל חשבון ייעודי",         included: true },
      { text: "הדרכה ואונבורדינג",         included: true },
      { text: "SLA מותאם",                 included: true },
      { text: "תמיכה 24/7",               included: true },
    ],
  },
];

/* ── Checkmark icon ── */
function Check() {
  return (
    <svg
      className="shrink-0 text-violet-400"
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── X icon ── */
function Cross() {
  return (
    <svg
      className="shrink-0 text-indigo-600"
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6"  y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ── Plan card ── */
function PlanCard({ plan, period, index }: { plan: Plan; period: Period; index: number }) {
  const price = period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  const suffix =
    price === "חינם" || price === "צור קשר"
      ? null
      : period === "yearly"
      ? "/ שנה"
      : "/ חודש";

  const isHighlighted = plan.highlighted;

  return (
    <AnimateIn delay={index * 100} from="bottom" className="flex flex-col h-full">

      {/*
        Badge slot — fixed height present on ALL cards so the grid keeps
        all three card tops aligned. Empty for non-badged plans.
      */}
      <div className="h-8 flex items-end justify-center pb-1">
        {plan.badge && (
          <span className="bg-violet-500 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-lg shadow-violet-500/30">
            {plan.badge}
          </span>
        )}
      </div>

      {/* Card — flex-1 so it fills the remainder of the grid cell */}
      <div
        className={[
          "flex flex-col flex-1 rounded-2xl",
          isHighlighted
            ? "ring-2 ring-violet-500/70 shadow-2xl shadow-violet-500/30"
            : "",
        ].join(" ")}
      >
        <GlassCard
          variant={isHighlighted ? "elevated" : "base"}
          className="flex flex-col h-full p-7"
        >
          <div dir="rtl" className="flex flex-col h-full gap-6">

            {/* Header */}
            <div>
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-1">
                {plan.name}
              </p>
              <p className="text-sm text-indigo-300/70">{plan.tagline}</p>
            </div>

            {/* Price — key=period forces re-mount on toggle → CSS fadeIn plays */}
            <div key={period} className="flex flex-col gap-1 animate-[priceFadeIn_0.2s_ease-out]">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white leading-none">
                  {price}
                </span>
                {suffix && (
                  <span className="text-sm text-indigo-300/60">{suffix}</span>
                )}
              </div>
              {/* Yearly saving tag */}
              {period === "yearly" && plan.yearlySaving && (
                <span className="inline-flex self-start text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300">
                  {plan.yearlySaving}
                </span>
              )}
              <p className="text-xs text-indigo-300/60 mt-1">{plan.description}</p>
            </div>

            {/* CTA */}
            {plan.ctaExternal ? (
              <a
                href={plan.ctaHref}
                className={[
                  "w-full text-center text-sm font-semibold py-3 rounded-xl transition-all active:scale-[0.98]",
                  isHighlighted
                    ? "bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg shadow-black/15"
                    : "bg-white/10 border border-white/20 text-white hover:bg-white/15",
                ].join(" ")}
              >
                {plan.cta}
              </a>
            ) : (
              <Link
                href={plan.ctaHref}
                className={[
                  "w-full text-center text-sm font-semibold py-3 rounded-xl transition-all active:scale-[0.98]",
                  isHighlighted
                    ? "bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg shadow-black/15"
                    : "bg-white/10 border border-white/20 text-white hover:bg-white/15",
                ].join(" ")}
              >
                {plan.cta}
              </Link>
            )}

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Feature list */}
            <ul className="flex flex-col gap-3 flex-1">
              {plan.features.map(({ text, included }) => (
                <li key={text} className="flex items-center gap-2.5 text-right">
                  {included ? <Check /> : <Cross />}
                  <span
                    className={[
                      "text-sm leading-snug",
                      included ? "text-indigo-100" : "text-indigo-500",
                    ].join(" ")}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ul>

          </div>
        </GlassCard>
      </div>
    </AnimateIn>
  );
}

/* ── Section ── */
export function PricingSection() {
  const [period, setPeriod] = useState<Period>("monthly");

  return (
    <SectionWrapper id="pricing">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div dir="rtl" className="flex flex-col items-center text-center gap-4 mb-10">
        <AnimateIn delay={0}>
          <SectionBadge>מחירים</SectionBadge>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            תמחור פשוט, ללא הפתעות
          </h2>
        </AnimateIn>

        <AnimateIn delay={160}>
          <p className="text-lg text-indigo-200/80 leading-relaxed max-w-xl">
            התחילו חינם, שדרגו כשאתם מוכנים. ביטול בכל עת.
          </p>
        </AnimateIn>
      </div>

      {/* ── Billing toggle ────────────────────────────────────────────── */}
      <AnimateIn delay={200}>
        <div className="flex justify-center mb-12">
          <div
            dir="rtl"
            role="group"
            aria-label="תקופת חיוב"
            className="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1"
          >
            <button
              onClick={() => setPeriod("monthly")}
              className={[
                "text-sm font-medium px-5 py-2 rounded-lg transition-all",
                period === "monthly"
                  ? "bg-white text-indigo-700 shadow-sm shadow-black/10"
                  : "text-indigo-300 hover:text-white",
              ].join(" ")}
              aria-pressed={period === "monthly"}
            >
              חודשי
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={[
                "text-sm font-medium px-5 py-2 rounded-lg transition-all flex items-center gap-2",
                period === "yearly"
                  ? "bg-white text-indigo-700 shadow-sm shadow-black/10"
                  : "text-indigo-300 hover:text-white",
              ].join(" ")}
              aria-pressed={period === "yearly"}
            >
              שנתי
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                2 חודשים חינם
              </span>
            </button>
          </div>
        </div>
      </AnimateIn>

      {/* ── Plan cards ────────────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch"
      >
        {PLANS.map((plan, i) => (
          <PlanCard key={plan.name} plan={plan} period={period} index={i} />
        ))}
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────── */}
      <AnimateIn delay={0}>
        <p
          dir="rtl"
          className="text-center text-xs text-indigo-400/50 mt-8"
        >
          * מחירי השקה לתקופת הבטא — עשויים להתעדכן בהמשך.
        </p>
      </AnimateIn>
    </SectionWrapper>
  );
}
