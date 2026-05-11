"use client";

import Link from "next/link";

// ── Card data shape ────────────────────────────────────────────────────────────

interface CardDef {
  href?:     string;         // undefined → disabled / coming soon
  icon:      React.ReactNode;
  title:     string;
  subtitle:  string;
  iconBg:    string;         // Tailwind bg + text color for the icon badge
}

// ── Individual tile ────────────────────────────────────────────────────────────

function QuickCard({ href, icon, title, subtitle, iconBg }: CardDef) {
  const active = !!href;

  const tile = (
    <div
      className={[
        // Base
        "relative flex flex-col p-6 rounded-2xl border transition-all duration-200",
        // Height — tall enough to feel substantial
        "min-h-[196px]",
        active
          ? [
              // Active: bright white, clear border, hover lift + shadow
              "bg-white border-gray-200 cursor-pointer group",
              "hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-100/60",
              "hover:-translate-y-1",
            ].join(" ")
          : [
              // Disabled: very muted — content washed out, no pointer
              "bg-gray-50/70 border-gray-100/80 cursor-not-allowed select-none",
            ].join(" "),
      ].join(" ")}
    >
      {/* ── Icon badge ──────────────────────────────────────────────────── */}
      <div
        className={[
          "w-14 h-14 rounded-xl flex items-center justify-center mb-5 flex-shrink-0",
          active ? iconBg : "bg-gray-100 text-gray-300",
        ].join(" ")}
      >
        {icon}
      </div>

      {/* ── Typography ──────────────────────────────────────────────────── */}
      <p
        className={[
          "text-[15px] font-bold leading-snug mb-2",
          active ? "text-gray-900" : "text-gray-400",
        ].join(" ")}
      >
        {title}
      </p>
      <p
        className={[
          "text-sm leading-relaxed",
          active ? "text-gray-500" : "text-gray-400",
        ].join(" ")}
      >
        {subtitle}
      </p>

      {/* ── Bottom row ──────────────────────────────────────────────────── */}
      <div className="mt-auto pt-5">
        {active ? (
          /* CTA — visible on hover via group */
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-500 group-hover:text-indigo-600 transition-colors">
            התחל
            {/* RTL-aware arrow: points left in Hebrew context */}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              className="rtl:rotate-180"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </span>
        ) : (
          /* Coming-soon pill */
          <span className="inline-flex items-center text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            בקרוב
          </span>
        )}
      </div>
    </div>
  );

  if (!active) {
    // Not clickable — plain wrapper preserves grid layout
    return <div>{tile}</div>;
  }

  return (
    <Link
      href={href!}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-2xl"
    >
      {tile}
    </Link>
  );
}

// ── Icons (24 × 24 viewbox, strokeWidth 1.8 for a refined look) ───────────────

/** החתמת מתעניין — person with a signature pen */
function IconInterestedBuyer() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {/* Person */}
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      {/* Pen stroke at bottom-right */}
      <path d="M16.5 17.5 18 16l2 2-1.5 1.5" />
      <path d="M18 16l-1.5 4" />
    </svg>
  );
}

/** החתמת בעל נכס / בלעדיות — building with a shield/lock */
function IconExclusivity() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {/* Building */}
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      {/* Door */}
      <rect x="9.5" y="13" width="5" height="8" rx="0.5" />
      {/* Small lock on door */}
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}

/** הסכם שיתוף פעולה — two hands / handshake */
function IconCooperation() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {/* Two people */}
      <circle cx="8" cy="7" r="3" />
      <path d="M4 20v-1.5a4 4 0 0 1 4-4" />
      <circle cx="16" cy="7" r="3" />
      <path d="M20 20v-1.5a4 4 0 0 0-4-4" />
      {/* Link / handshake bar */}
      <path d="M9 14.5h6" />
    </svg>
  );
}

/** העברת לקוח — person with bidirectional arrows */
function IconTransfer() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {/* Person */}
      <circle cx="12" cy="7" r="3.5" />
      <path d="M6 20v-1a6 6 0 0 1 6-6 6 6 0 0 1 6 6v1" />
      {/* Left-right arrows beneath */}
      <path d="M4 17h3M4 17l1.5-1.5M4 17l1.5 1.5" />
      <path d="M20 17h-3M20 17l-1.5-1.5M20 17l-1.5 1.5" />
    </svg>
  );
}

// ── Card definitions ───────────────────────────────────────────────────────────
//
// Only "החתמת מתעניין" is wired to a live contract flow.
// The remaining three are placeholders pending lawyer-approved templates.
// They are intentionally left disabled (no href) until further notice.

const CARDS: CardDef[] = [
  {
    href:     "/contracts/quick/interested",
    icon:     <IconInterestedBuyer />,
    title:    "החתמת מתעניין",
    subtitle: "רישום הסכמת רוכש או שוכר פוטנציאלי",
    iconBg:   "bg-indigo-50 text-indigo-600",
  },
  {
    // Disabled — template pending legal sign-off
    icon:    <IconExclusivity />,
    title:   "החתמת בעל נכס / בלעדיות",
    subtitle: "הסכם בלעדיות עם בעל הנכס",
    iconBg:  "bg-emerald-50 text-emerald-600",
  },
  {
    // Disabled — template pending legal sign-off
    icon:    <IconCooperation />,
    title:   "הסכם שיתוף פעולה בין מתווכים",
    subtitle: "שיתוף עסקה עם מתווך שותף",
    iconBg:  "bg-violet-50 text-violet-600",
  },
  {
    // Disabled — not yet designed
    icon:    <IconTransfer />,
    title:   "העברת לקוח בין מתווכים",
    subtitle: "רישום העברת לקוח ממתווך אחר",
    iconBg:  "bg-rose-50 text-rose-500",
  },
];

// ── Section ────────────────────────────────────────────────────────────────────

export function QuickContractCards() {
  return (
    <section className="mb-10">
      {/* Section header */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900 leading-tight">
          מה ברצונך ליצור?
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          בחר סוג חוזה להתחיל
        </p>
      </div>

      {/*
        Responsive grid:
          mobile  (< 640px)  → 1 column
          sm      (≥ 640px)  → 2 columns
          xl      (≥ 1280px) → 4 columns
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {CARDS.map((card) => (
          <QuickCard key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}
