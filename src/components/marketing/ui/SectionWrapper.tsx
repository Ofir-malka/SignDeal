import type { ReactNode } from "react";

interface Props {
  /** HTML id for anchor nav links (e.g. "features", "how", "pricing") */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Consistent section shell: vertical rhythm + max-width container + horizontal padding.
 * Every marketing section wraps its content in this — never sets its own py/max-w.
 */
export function SectionWrapper({ id, className = "", children }: Props) {
  return (
    <section
      id={id}
      className={["py-20 sm:py-28", className].filter(Boolean).join(" ")}
    >
      <div className="max-w-6xl mx-auto px-6">
        {children}
      </div>
    </section>
  );
}
