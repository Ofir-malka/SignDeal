"use client";

import Link from "next/link";

// ── Individual card ────────────────────────────────────────────────────────────

interface CardProps {
  href?:       string;
  icon:        React.ReactNode;
  title:       string;
  subtitle:    string;
  iconBg:      string;   // Tailwind classes for the icon container
  disabled?:   boolean;
}

function QuickCard({ href, icon, title, subtitle, iconBg, disabled }: CardProps) {
  const inner = (
    <div
      className={[
        "flex items-center gap-3 p-4 bg-white rounded-xl border transition-all",
        disabled
          ? "border-gray-100 opacity-55 cursor-not-allowed select-none"
          : "border-gray-200 hover:border-indigo-300 hover:shadow-md cursor-pointer group",
      ].join(" ")}
    >
      {/* Icon badge */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{subtitle}</p>
      </div>

      {/* "בקרוב" badge  (disabled only) */}
      {disabled && (
        <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          בקרוב
        </span>
      )}
    </div>
  );

  if (disabled || !href) return inner;

  // Wrap in Link so the whole card is clickable
  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">
      {inner}
    </Link>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

export function QuickContractCards() {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">מה תרצה ליצור עכשיו?</h2>

      {/*
        Mobile:  1 column
        sm (640px+): 2 columns
        lg (1024px+): 4 columns
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* 1. החתמת מתעניין */}
        <QuickCard
          href="/contracts/new?type=interested"
          icon={<IconUser />}
          title="החתמת מתעניין"
          subtitle="רישום הסכמת רוכש/שוכר פוטנציאלי"
          iconBg="bg-indigo-50 text-indigo-600"
        />

        {/* 2. חוזה תיווך מכירה */}
        <QuickCard
          href="/contracts/new?type=exclusivity&deal=sale"
          icon={<IconHome />}
          title="חוזה תיווך מכירה"
          subtitle="הסכם בלעדיות לנכס למכירה"
          iconBg="bg-emerald-50 text-emerald-600"
        />

        {/* 3. חוזה תיווך שכירות */}
        <QuickCard
          href="/contracts/new?type=exclusivity&deal=rental"
          icon={<IconKey />}
          title="חוזה תיווך שכירות"
          subtitle="הסכם בלעדיות לנכס להשכרה"
          iconBg="bg-amber-50 text-amber-600"
        />

        {/* 4. בקרוב — disabled */}
        <QuickCard
          icon={<IconPlus />}
          title="בקרוב"
          subtitle="סוגי חוזים נוספים בדרך"
          iconBg="bg-gray-100 text-gray-400"
          disabled
        />
      </div>
    </div>
  );
}
