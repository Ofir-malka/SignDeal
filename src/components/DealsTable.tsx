"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contract } from "@/lib/contracts-data";

// ─── Display status ───────────────────────────────────────────────────────────

type DisplayStatus =
  | "טיוטה"
  | "ממתין לחתימה"
  | "נפתח"
  | "נחתם"
  | "ממתין לתשלום"
  | "שולם"
  | "פג תוקף"
  | "בוטל";

function toDisplayStatus(c: Contract): DisplayStatus {
  switch (c.signatureStatus) {
    case "בוטל":          return "בוטל";
    case "פג תוקף":       return "פג תוקף";
    case "שולם":          return "שולם";
    case "ממתין לתשלום":  return "ממתין לתשלום";
    case "נחתם":          return "נחתם";
    case "נפתח":          return "נפתח";
    case "נשלח":          return "ממתין לחתימה";
    case "טיוטה":
    default:              return "טיוטה";
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const statusStyles: Record<DisplayStatus, { bg: string; text: string; dot: string }> = {
  "טיוטה":           { bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-400"    },
  "ממתין לחתימה":   { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500"   },
  "נפתח":            { bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-400"    },
  "נחתם":            { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500" },
  "ממתין לתשלום":   { bg: "bg-orange-50",   text: "text-orange-700",  dot: "bg-orange-500"  },
  "שולם":            { bg: "bg-indigo-50",   text: "text-indigo-700",  dot: "bg-indigo-500"  },
  "פג תוקף":         { bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-400"    },
  "בוטל":            { bg: "bg-red-50",      text: "text-red-600",     dot: "bg-red-400"     },
};

function StatusBadge({ status }: { status: DisplayStatus }) {
  const s = statusStyles[status] ?? statusStyles["טיוטה"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

const contractTypeColors: Record<string, string> = {
  "שכירות": "bg-blue-50 text-blue-700",
  "מכירה":  "bg-purple-50 text-purple-700",
};

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
          <div className="h-3.5 bg-gray-100 rounded w-24" />
        </div>
      </td>
      <td className="px-4 sm:px-6 py-4"><div className="h-6 bg-gray-100 rounded w-16" /></td>
      <td className="px-4 sm:px-6 py-4 hidden md:table-cell"><div className="h-3.5 bg-gray-100 rounded w-40" /></td>
      <td className="px-4 sm:px-6 py-4"><div className="h-6 bg-gray-100 rounded-full w-24" /></td>
      <td className="px-4 sm:px-6 py-4"><div className="h-3.5 bg-gray-100 rounded w-20" /></td>
      <td className="px-4 sm:px-6 py-4" />
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DealsTable({
  contracts,
  loading,
}: {
  contracts: Contract[];
  loading:   boolean;
}) {
  const router = useRouter();

  // Show most recent 10 on dashboard; full list is on /contracts
  const rows = contracts.slice(0, 10);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">חוזים אחרונים</h2>
          <p className="text-sm text-gray-500 mt-0.5">הפעילות האחרונה שלך</p>
        </div>
        <Link href="/contracts" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
          הצג הכל
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-right px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">לקוח</th>
              <th className="text-right px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">סוג</th>
              <th className="text-right px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">נכס</th>
              <th className="text-right px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">סטטוס</th>
              <th className="text-right px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">עמלה</th>
              <th className="px-4 sm:px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-14 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">אין חוזים עדיין</p>
                      <p className="text-xs text-gray-400 mt-0.5">שלח את החוזה הראשון שלך ללקוח</p>
                    </div>
                    <Link
                      href="/contracts/new"
                      className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      צור חוזה חדש
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const displayStatus = toDisplayStatus(c);
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    className="hover:bg-gray-50/60 transition-colors group cursor-pointer"
                  >
                    {/* Client */}
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-semibold">{c.client.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-none">{c.client}</span>
                      </div>
                    </td>

                    {/* Deal type */}
                    <td className="px-4 sm:px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${contractTypeColors[c.dealType] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.dealType}
                      </span>
                    </td>

                    {/* Property — hidden on mobile */}
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      <span className="text-sm text-gray-600 truncate max-w-[180px] block">{c.property}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 sm:px-6 py-4">
                      <StatusBadge status={displayStatus} />
                    </td>

                    {/* Commission */}
                    <td className="px-4 sm:px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900">{c.commission}</span>
                    </td>

                    {/* Action dot — visible on row hover */}
                    <td className="px-4 sm:px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/contracts/${c.id}`}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-indigo-600 font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        פתח ←
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer — only when there are more contracts than shown */}
      {!loading && contracts.length > 10 && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 text-center">
          <Link href="/contracts" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            הצג את כל {contracts.length} החוזים ←
          </Link>
        </div>
      )}
    </div>
  );
}
