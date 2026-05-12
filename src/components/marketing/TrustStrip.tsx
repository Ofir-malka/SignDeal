import { AnimateIn } from "@/components/marketing/ui/AnimateIn";

/**
 * TrustStrip — concrete workflow value signals.
 * Sits immediately below the hero as a thin transitional band.
 * Each item names a specific product capability, not a generic claim.
 */

const ITEMS = [
  {
    label: "חוזה מוכן תוך 3 דקות",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "חתימה ב-SMS",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "גביית עמלה מהנייד",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    label: "תמיכה בעברית",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
] as const;

export function TrustStrip() {
  return (
    <div
      dir="rtl"
      className="bg-indigo-950/70 border-y border-white/10 py-8 sm:py-10"
    >
      <div className="max-w-6xl mx-auto px-6">
        <AnimateIn delay={0}>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0 list-none m-0 p-0">
            {ITEMS.map(({ label, icon }, i) => (
              <li
                key={label}
                className={[
                  "flex flex-col items-center gap-3 text-center px-4",
                  // Vertical divider between items on sm+, suppress on last
                  i < ITEMS.length - 1 ? "sm:border-l sm:border-white/10" : "",
                ].filter(Boolean).join(" ")}
              >
                <span className="text-violet-400">{icon}</span>
                <span className="text-sm text-indigo-200 font-medium leading-snug">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </AnimateIn>
      </div>
    </div>
  );
}
