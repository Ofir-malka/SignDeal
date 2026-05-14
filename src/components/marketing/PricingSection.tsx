"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * PricingSection — Phase 6 rewrite.
 *
 * New plan lineup: STANDARD / מתקדמת / פרו (3-col grid) + AGENCY (full-width row)
 * Yearly toggle shows per-month equivalent + emerald saving badge + annual total note.
 * GROWTH & PRO cards open with "הכל שב-X" halo row in italic indigo.
 * AGENCY card: teal horizontal layout, mailto CTA "קבעו שיחת התאמה".
 * Trust strip: 4 items including "14 יום ניסיון חינם".
 * Disclaimer: VAT note + yearly billing note.
 *
 * All self-serve CTAs → /register.
 * id="pricing" matches the #pricing NavBar anchor.
 */

type Period = "monthly" | "yearly";

// ─── Self-serve plan definitions ──────────────────────────────────────────────

interface SelfServePlan {
  id:            string;
  name:          string;
  tagline:       string;
  monthlyPrice:  number;   // ₪/month, billed monthly
  yearlyMonthly: number;   // ₪/month, billed yearly
  yearlyTotal:   number;   // ₪ annual total
  yearlySaving:  number;   // ₪ saved vs monthly billing over 12 months
  cta:           string;
  highlighted:   boolean;
  badge?:        string;
  halosFrom?:    string;   // e.g. "סטנדרט" → renders "הכל שב-סטנדרט" halo row
  features:      string[];
}

const SELF_SERVE: SelfServePlan[] = [
  {
    id:            "standard",
    name:          "סטנדרט",
    tagline:       "הכול כדי להתחיל לעבוד דיגיטל",
    monthlyPrice:  39,
    yearlyMonthly: 29,
    yearlyTotal:   348,
    yearlySaving:  120,
    cta:           "התחל ניסיון חינם",
    highlighted:   false,
    features: [
      "עד 30 חוזים בחודש",
      "חתימה דיגיטלית מהנייד",
      "שליחת חוזה ב-SMS",
      "לוח בקרה בסיסי",
      "תמיכה בדוא״ל",
    ],
  },
  {
    id:            "growth",
    name:          "מתקדמת",
    tagline:       "לסוכן שמתרחב ורוצה יותר",
    monthlyPrice:  49,
    yearlyMonthly: 39,
    yearlyTotal:   468,
    yearlySaving:  120,
    cta:           "התחל ניסיון חינם",
    highlighted:   false,
    halosFrom:     "סטנדרט",
    features: [
      "עד 60 חוזים בחודש",
      "גביית עמלות מהנייד",
      "תזכורות אוטומטיות SMS + Email",
      "דשבורד מלא + מעקב עסקאות",
      "תמיכה מועדפת בעברית",
    ],
  },
  {
    id:            "pro",
    name:          "פרו",
    tagline:       "הכי מתאים לסוכנים פעילים",
    monthlyPrice:  110,
    yearlyMonthly: 99,
    yearlyTotal:   1188,
    yearlySaving:  132,
    cta:           "התחל ניסיון חינם",
    highlighted:   true,
    badge:         "הכי פופולרי",
    halosFrom:     "מתקדמת",
    features: [
      "עד 100 חוזים בחודש",
      "ניהול לקוחות ונכסים",
      "PDF חוזה להורדה",
      "היסטוריית תשלומים מלאה",
      "תמיכה מועדפת — עדיפות גבוהה",
    ],
  },
];

// ─── Trust strip ──────────────────────────────────────────────────────────────

interface TrustItem {
  label: string;
  href?: string;
  icon:  React.ReactNode;
}

const TRUST_ITEMS: TrustItem[] = [
  {
    label: "14 יום ניסיון חינם",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "ללא כרטיס אשראי",
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
    href:  "/legal/terms#cancellation",
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
] as const;

// ─── Small icons ──────────────────────────────────────────────────────────────

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

function ArrowRightIcon() {
  return (
    <svg
      className="shrink-0 text-indigo-400"
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* RTL context: visually this is an "includes previous" arrow */}
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Self-serve plan card ─────────────────────────────────────────────────────

function PlanCard({ plan, period, index }: { plan: SelfServePlan; period: Period; index: number }) {
  const isHighlighted = plan.highlighted;

  const displayPrice    = period === "yearly" ? plan.yearlyMonthly : plan.monthlyPrice;
  const annualTotal     = plan.yearlyTotal;
  const yearlySaving    = plan.yearlySaving;

  return (
    <AnimateIn delay={index * 90} from="bottom" className="flex flex-col h-full">

      {/* Badge spacer — keeps all card tops aligned */}
      <div className="h-9 flex items-end justify-center pb-1.5">
        {plan.badge && (
          <span className="text-xs font-bold px-4 py-1 rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/40">
            {plan.badge}
          </span>
        )}
      </div>

      {/* Outer glow + hover lift */}
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
        {/* PRO radial glow — behind the card */}
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

            {/* Plan header */}
            <div className="flex flex-col gap-1.5">
              <span
                className={[
                  "self-start text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg",
                  isHighlighted
                    ? "bg-violet-400/20 text-violet-300 border border-violet-400/30"
                    : "bg-white/8 text-indigo-300 border border-white/10",
                ].join(" ")}
              >
                {plan.name}
              </span>
              <p className="text-sm text-indigo-300/65 mt-0.5">{plan.tagline}</p>
            </div>

            {/* Price block — key=period forces re-mount → priceFadeIn plays */}
            <div key={period} className="flex flex-col gap-1 animate-[priceFadeIn_0.2s_ease-out]">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={[
                    "font-black text-white leading-none",
                    isHighlighted ? "text-5xl" : "text-4xl",
                  ].join(" ")}
                >
                  ₪{displayPrice}
                </span>
                <span className="text-sm text-indigo-300/60 font-normal">/ חודש</span>
              </div>

              {/* Yearly extras: saving badge + annual total note */}
              {period === "yearly" && (
                <>
                  <span className="self-start text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-300 mt-0.5">
                    חסכון ₪{yearlySaving}
                  </span>
                  <p className="text-xs text-indigo-400/50 mt-0.5">
                    סה״כ ₪{annualTotal} / שנה
                  </p>
                </>
              )}

              {period === "monthly" && (
                <p className="text-xs text-indigo-400/55 mt-0.5">14 יום ניסיון חינם</p>
              )}
            </div>

            {/* CTA */}
            <Link
              href="/register"
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

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Feature list */}
            <ul className="flex flex-col gap-2.5 flex-1">
              {/* Halo row — "includes everything from previous plan" */}
              {plan.halosFrom && (
                <li className="flex items-center gap-2 text-right">
                  <ArrowRightIcon />
                  <span className="text-xs italic text-indigo-400/75 leading-snug">
                    הכל שב-{plan.halosFrom}
                  </span>
                </li>
              )}

              {plan.features.map((text) => (
                <li key={text} className="flex items-start gap-2.5 text-right">
                  <CheckIcon highlighted={isHighlighted} />
                  <span
                    className={[
                      "text-sm leading-snug",
                      isHighlighted ? "text-indigo-100" : "text-indigo-200/90",
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

// ─── AGENCY card (full-width horizontal) ─────────────────────────────────────

function AgencyCard({ period }: { period: Period }) {
  return (
    <AnimateIn delay={320} from="bottom">
      <div
        dir="rtl"
        className={[
          "relative rounded-2xl border border-teal-400/30",
          "bg-gradient-to-l from-teal-500/[0.10] via-indigo-900/50 to-indigo-950/70",
          "backdrop-blur-md",
          "transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-teal-500/20",
          "hover:border-teal-400/50",
        ].join(" ")}
      >
        {/* Subtle teal glow */}
        <div
          aria-hidden="true"
          className="absolute -inset-2 rounded-3xl bg-teal-500/8 blur-2xl pointer-events-none -z-10"
        />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-7">

          {/* Plan identity */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="self-start text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg bg-teal-400/15 text-teal-300 border border-teal-400/25">
              AGENCY
            </span>
            <p className="text-white font-bold text-lg leading-snug mt-0.5">
              לסוכנויות ורשתות תיווך
            </p>
            <p className="text-sm text-indigo-300/65">
              חוזים ללא הגבלה, ניהול מרובה סוכנים, SLA ייעודי, מנהל חשבון אישי, API ו-Webhooks.
            </p>
          </div>

          {/* Features chips */}
          <ul className="flex flex-wrap gap-2 sm:max-w-[280px]">
            {[
              "חוזים ללא הגבלה",
              "ניהול צוות",
              "SLA ו-24/7",
              "API מלא",
              "אונבורדינג מותאם",
            ].map((f) => (
              <li
                key={f}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-200"
              >
                {f}
              </li>
            ))}
          </ul>

          {/* Price + CTA */}
          <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
            <div key={period} className="animate-[priceFadeIn_0.2s_ease-out]">
              <p className="text-2xl font-black text-white">מחיר מותאם</p>
              <p className="text-xs text-teal-300/70 mt-0.5 text-right">לפי גודל הצוות והצרכים</p>
            </div>
            <a
              href="mailto:support@signdeal.co.il"
              className={[
                "text-sm font-bold px-6 py-3 rounded-xl whitespace-nowrap",
                "bg-teal-500 text-white hover:bg-teal-400 transition-colors active:scale-[0.98]",
                "shadow-lg shadow-teal-500/30",
              ].join(" ")}
            >
              קבעו שיחת התאמה
            </a>
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
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-10
                   py-5 px-6 rounded-2xl bg-white/[0.03] border border-white/8"
      >
        {TRUST_ITEMS.map(({ label, icon, href }) => (
          <span key={label} className="flex items-center gap-2 text-sm text-indigo-300/65">
            <span className="text-violet-400">{icon}</span>
            {href ? (
              <a href={href} className="hover:text-white transition-colors underline-offset-2 hover:underline">
                {label}
              </a>
            ) : (
              label
            )}
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

      {/* Header */}
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
            התחילו בניסיון חינם של 14 יום, שדרגו כשאתם מוכנים. ביטול בכל עת — בלי קנסות.
          </p>
        </AnimateIn>
      </div>

      {/* Billing toggle */}
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
                    עד 25% הנחה
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </AnimateIn>

      {/* 3-col self-serve grid */}
      <div
        dir="rtl"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch"
      >
        {SELF_SERVE.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} period={period} index={i} />
        ))}
      </div>

      {/* AGENCY — full-width row */}
      <div className="mt-6">
        <AgencyCard period={period} />
      </div>

      {/* Trust strip */}
      <TrustStrip />

      {/* Disclaimer */}
      <AnimateIn delay={0}>
        <p dir="rtl" className="text-center text-xs text-indigo-400/40 mt-6 leading-relaxed">
          המחירים לא כוללים מע״מ. חיוב שנתי מחויב בתשלום אחד מראש.
        </p>
      </AnimateIn>

    </SectionWrapper>
  );
}
