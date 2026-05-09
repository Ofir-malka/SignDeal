import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Small pill label used at the top of every section:
 *   "הפתרון" / "איך זה עובד" / "מחירים" etc.
 */
export function SectionBadge({ children }: Props) {
  return (
    <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" aria-hidden="true" />
      <span className="text-xs text-white/80 font-medium">{children}</span>
    </div>
  );
}
