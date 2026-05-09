import { AnimateIn } from "@/components/marketing/ui/AnimateIn";

/**
 * Honest trust signals — no fake statistics, no aspirational numbers.
 * Sits immediately below the hero as a thin transitional band.
 */

const ITEMS = [
  {
    label: "צוות ישראלי",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "תמיכה בעברית",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "נבנה למתווכים בישראל",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "חוזים, חתימות ותשלומים במקום אחד",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
