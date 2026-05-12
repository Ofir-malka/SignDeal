"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * PricingSection — Phase 5 upgrade.
 *
 * Changes vs Phase 1:
 *   • Richer feature bullets per plan (grouped, contextual copy)
 *   • Pro card: radial glow, stronger ring, gradient bg, larger price
 *   • All cards: hover elevation (translate-y + shadow)
 *   • Onboarding reassurance row under the grid
 *   • Microcopy "אין צורך בכרטיס אשראי" under Starter + Pro CTAs
 *   • Better plan-name pill badges with per-plan colour
 *   • Feature list: included items in indigo-100, excluded muted + smaller
 *   • Enterprise card: contact CTA via mailto (unchanged)
 *
 * All self-serve CTAs go to /register.
 * id="pricing" matches the #pricing NavBar anchor.
 */

type Period = "monthly" | "yearly";

interface Feature { text: string; included: boolean }

interface Plan {
  id:           string;
  name:         string;
  tagline:      string;
  monthlyPrice: string;
  yearlyPrice:  string;
  yearlySaving?: string;
  priceNote?:   string;
  cta:          string;
  ctaHref:      string;
  ctaExternal?: boolean;
  ctaMicro?:    string;
  highlighted:  boolean;
  badge?:       string;
  badgeCls:     string;
  nameCls:      string;
  features:     Feature[];
}

// ─── Plan data ────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id:           "starter",
    name:         "Starter",
    tagline:      "להתחיל בלי סיכון",
    monthlyPrice: "חינם",
    yearlyPrice:  "חינם",
    priceNote:    "לתמיד — ללא כרטיס אשראי",
    cta:          "התחל חינם עכשיו",
    ctaHref:      "/register",
    ctaMicro:     "אין צורך בכרטיס אשראי",
    highlighted:  false,
    badge:        undefined,
    badgeCls:     "",
    nameCls:      "text-indigo-300",
    features: [
      { text: "עד 3 חוזים פעילים בחודש",    included: true  },
      { text: "חתימה דיגיטלית מהנייד",       included: true  },
      { text: "שליחת חוזה ב-SMS",            included: true  },
      { text: "לוח בקרה בסיסי",              included: true  },
      { text: "תמיכה בדוא״ל",               included: true  },
      { text: "גביית עמלות (בקשת תשלום)",   included: false },
      { text: "תזכורות SMS ו-Email",         included: false },
      { text: "דשבורד מלא ומעקב עסקאות",    included: false },
      { text: "תמיכה מועדפת",               included: false },
    ],
  },
  {
    id:           "pro",
    name:         "Pro",
    tagline:      "לסוכן שסוגר עסקאות",
    monthlyPrice: "₪199",
    yearlyPrice:  "₪1,990",
    yearlySaving: "חסכון ₪398",
    priceNote:    "14 יום ניסיון חינם",
    cta:          "נסו Pro — 14 יום חינם",
    ctaHref:      "/register",
    ctaMicro:     "אין צורך בכרטיס אשראי",
    highlighted:  true,
    badge:        "הכי פופולרי",
    badgeCls:     "bg-violet-500 text-white shadow-lg shadow-violet-500/40",
    nameCls:      "text-violet-300",
    features: [
      { text: "חוזים ללא הגבלה",             included: true },
      { text: "חתימה דיגיטלית מהנייד",       included: true },
      { text: "גביית עמלות מהנייד",           included: true },
      { text: "תזכורות אוטומטיות SMS + Email",included: true },
      { text: "דשבורד מלא + מעקב עסקאות",    included: true },
      { text: "ניהול לקוחות ונכסים",         included: true },
      { text: "תמיכה מועדפת בעברית",         included: true },
      { text: "PDF חוזה להורדה",             included: true },
      { text: "היסטוריית תשלומים מלאה",      included: true },
    ],
  },
  {
    id:           "enterprise",
    name:         "Enterprise",
    tagline:      "לסוכנויות ורשתות תיווך",
    monthlyPrice: "צור קשר",
    yearlyPrice:  "צור קשר",
    priceNote:    "מחיר מותאם לצוות",
    cta:          "דברו איתנו",
    ctaHref:      "mailto:support@signdeal.co.il",
    ctaExternal:  true,
    highlighted:  false,
    badge:        undefined,
    badgeCls:     "",
    nameCls:      "text-teal-300",
    features: [
      { text: "הכל שכלול ב-Pro",             included: true },
      { text: "משתמשים מרובים (צוות)",        included: true },
      { text: "ניהול מרובה סוכנים",           included: true },
      { text: "API ו-Webhooks",              included: true },
      { text: "מנהל חשבון ייעודי",           included: true },
      { text: "הדרכה ואונבורדינג",           included: true },
      { text: "SLA ותמיכה 24/7",            included: true },
    ],
  },
];

// ─── Trust strip items ────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  {
    label: "ללא התחייבות",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: "ביטול בכל עת",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    label: "תמיכה בעברית",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "התחלה תוך דקות",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
] as const;

// ─── Feature icon helpers ─────────────────────────────────────────────────────

function CheckIcon({ highlighted }: { highlighted: boolean }) {
  return (
    <svg
      className={highlighted ? "shrink-0 text-violet-300" : "shrink-0 text-emerald-400"}
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      className="shrink-0 text-indigo-600/60"
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6"  y2="18" />
      <line x1="6"  y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, period, index }: { plan: Plan; period: Period; index: number }) {
  const price  = period === "yearly" ? plan.yearlyPrice  : plan.monthlyPrice;
  const suffix =
    price === "חינם" || price === "צור קשר" ? null
    : period === "yearly" ? "/ שנה"
    : "/ חודש";

  const isHighlighted = plan.highlighted;

  return (
    <AnimateIn delay={index * 90} from="bottom" className="flex flex-col h-full">

      {/* Badge spacer — fixed height keeps all card tops aligned */}
      <div className="h-9 flex items-end justify-center pb-1.5">
        {plan.badge && (
          <span className={`text-xs font-bold px-4 py-1 rounded-full ${plan.badgeCls}`}>
            {plan.badge}
          </span>
        )}
      </div>

      {/* Outer wrapper — handles glow + hover elevation */}
      <div
        className={[
          "relative flex flex-col flex-1 rounded-2xl",
          "transition-all duration-300",
          "hover:-translate-y-1.5 hover:shadow-2xl",
          isHighlighted
            ? "hover:shadow-violet-500/30 ring-2 ring-violet-400/80 shadow-xl shadow-violet-500/25"
            : "hover:shadow-indigo-900/60",
        ].join(" ")}
      >
        {/* Pro glow — behind the card */}
        {isHighlighted && (
          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-3xl bg-violet-600/12 blur-2xl pointer-events-none -z-10"
          />
        )}

        {/* Card body */}
        <div
          className={[
            "flex flex-col h-full rounded-2xl border",
            isHighlighted
              ? "bg-gradient-to-b from-violet-500/[0.14] via-indigo-900/60 to-indigo-950/80 border-violet-400/40"
              : "bg-white/[0.05] border-white/10",
            "backdrop-blur-md",
          ].join(" ")}
        >
          <div dir="rtl" className="flex flex-col h-full p-7 gap-6">

            {/* ── Plan header ── */}
            <div className="flex flex-col gap-1.5">
              {/* Name pill */}
              <span
                className={[
                  "self-start text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg",
                  isHighlighted
                    ? "bg-violet-400/20 text-violet-300 border border-violet-400/30"
                    : plan.id === "enterprise"
                    ? "bg-teal-400/15 text-teal-300 border border-teal-400/25"
                    : "bg-white/8 text-indigo-300 border border-white/10",
                ].join(" ")}
              >
                {plan.name}
              </span>
              <p className="text-sm text-indigo-300/65 mt-0.5">{plan.tagline}</p>
            </div>

            {/* ── Price block ── */}
            {/* key=period forces DOM re-mount → priceFadeIn keyframe plays */}
            <div key={period} className="flex flex-col gap-1 animate-[priceFadeIn_0.2s_ease-out]">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={[
                    "font-black text-white leading-none",
                    isHighlighted ? "text-5xl" : "text-4xl",
                  ].join(" ")}
                >
                  {price}
                </span>
                {suffix && (
                  <span className="text-sm text-indigo-300/60 font-normal">{suffix}</span>
                )}
              </div>

              {/* Yearly saving badge */}
              {period === "yearly" && plan.yearlySaving && (
                <span className="self-start text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 mt-0.5">
                  {plan.yearlySaving}
                </span>
              )}

              <p className="text-xs text-indigo-400/60 mt-0.5">{plan.priceNote}</p>
            </div>

            {/* ── CTA ── */}
            <div className="flex flex-col gap-1.5">
              {plan.ctaExternal ? (
                <a
                  href={plan.ctaHref}
                  className={[
                    "w-full text-center text-sm font-bold py-3.5 rounded-xl",
                    "transition-all active:scale-[0.98]",
                    "bg-white/8 border border-white/15 text-white hover:bg-white/[0.13]",
                  ].join(" ")}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  href={plan.ctaHref}
                  className={[
                    "w-full text-center text-sm font-bold py-3.5 rounded-xl",
                    "transition-all active:scale-[0.98]",
                    isHighlighted
                      ? "bg-white text-indigo-700 hover:bg-indigo-50 shadow-xl shadow-black/20 ring-1 ring-white/30"
                      : "bg-white/8 border border-white/15 text-white hover:bg-white/[0.13]",
                  ].join(" ")}
                >
                  {plan.cta}
                </Link>
              )}

              {/* Microcopy */}
              {plan.ctaMicro && (
                <p className="text-[11px] text-center text-indigo-400/55">
                  {plan.ctaMicro}
                </p>
              )}
            </div>

            {/* ── Divider ── */}
            <div className="border-t border-white/10" />

            {/* ── Feature list ── */}
            <ul className="flex flex-col gap-2.5 flex-1">
              {plan.features.map(({ text, included }) => (
                <li key={text} className="flex items-start gap-2.5 text-right">
                  {included ? <CheckIcon highlighted={isHighlighted} /> : <CrossIcon />}
                  <span
                    className={[
                      "text-sm leading-snug",
                      included
                        ? isHighlighted ? "text-indigo-100" : "text-indigo-200/90"
                        : "text-indigo-500/60 text-xs",
                    ].join(" ")}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ul>

          </div>
        </div>
      </div>
    </AnimateIn>
  );
}

// ─── Trust strip ──────────────────────────────────────────────────────────────

function TrustStrip() {
  return (
    <AnimateIn delay={80}>
      <div
        dir="rtl"
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-12
                   py-5 px-6 rounded-2xl bg-white/[0.03] border border-white/8"
      >
        {TRUST_ITEMS.map(({ label, icon }) => (
          <span key={label} className="flex items-center gap-2 text-sm text-indigo-300/65">
            <span className="text-violet-400">{icon}</span>
            {label}
          </span>
        ))}
      </div>
    </AnimateIn>
  );
}

// ─── Exported section ─────────────────────────────────────────────────────────

export function PricingSection() {
  const [period, setPeriod] = useState<Period>("monthly");

  return (
    <SectionWrapper id="pricing">

      {/* ── Header ──────────────────────────────────────────────────────── */}
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
            התחילו חינם, שדרגו כשאתם מוכנים. ביטול בכל עת — בלי קנסות.
          </p>
        </AnimateIn>
      </div>

      {/* ── Billing toggle ───────────────────────────────────────────────── */}
      <AnimateIn delay={200}>
        <div className="flex justify-center mb-10">
          <div
            dir="rtl"
            role="group"
            aria-label="תקופת חיוב"
            className="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1"
          >
            {(["monthly", "yearly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={[
                  "text-sm font-semibold px-5 py-2 rounded-lg transition-all flex items-center gap-2",
                  period === p
                    ? "bg-white text-indigo-700 shadow-sm shadow-black/15"
                    : "text-indigo-300 hover:text-white",
                ].join(" ")}
              >
                {p === "monthly" ? "חודשי" : "שנתי"}
                {p === "yearly" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                    2 חודשים חינם
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </AnimateIn>

      {/* Trial note */}
      <AnimateIn delay={220}>
        <p dir="rtl" className="text-center text-sm text-indigo-300/60 mb-10 -mt-4">
          כל התוכניות כוללות ניסיון חינם של 14 יום — ללא כרטיס אשראי.
        </p>
      </AnimateIn>

      {/* ── Plan cards ──────────────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch"
      >
        {PLANS.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} period={period} index={i} />
        ))}
      </div>

      {/* ── Onboarding reassurance strip ─────────────────────────────────── */}
      <TrustStrip />

      {/* ── Disclaimer ──────────────────────────────────────────────────── */}
      <AnimateIn delay={0}>
        <p dir="rtl" className="text-center text-xs text-indigo-400/40 mt-6">
          * מחירי השקה לתקופת הבטא — עשויים להתעדכן בהמשך עם הודעה מראש.
        </p>
      </AnimateIn>

    </SectionWrapper>
  );
}
