"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contract } from "@/lib/contracts-data";

// ─── Row type + mapper ────────────────────────────────────────────────────────

type DealRow = {
  id: string;
  contractId: number | string;
  client: string;
  contractType: string;
  property: string;
  status: string;
  amount: string;
};

function contractToDealRow(c: Contract): DealRow {
  let status: string;
  if (c.signatureStatus === "בוטל") {
    status = "בוטל";
  } else if (c.signatureStatus === "נחתם") {
    if (c.paymentStatus === "שולם")              status = "הושלם";
    else if (c.paymentStatus === "ממתין לתשלום") status = "ממתין לתשלום";
    else                                          status = "פעיל";
  } else {
    status = "ממתין לחתימה";
  }
  return {
    id: `row-${c.id}`,
    contractId: c.id,
    client: c.client,
    contractType: c.dealType,
    property: c.property,
    status,
    amount: c.propertyPrice,
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type StatusKey = "פעיל" | "ממתין לחתימה" | "ממתין לתשלום" | "הושלם" | "בוטל";

const statusStyles: Record<StatusKey, { bg: string; text: string; dot: string }> = {
  "פעיל":           { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "ממתין לחתימה":  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  "ממתין לתשלום":  { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500"  },
  "הושלם":          { bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400"    },
  "בוטל":           { bg: "bg-red-50",     text: "text-red-600",     dot: "bg-red-400"     },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status as StatusKey] ?? statusStyles["הושלם"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

const contractTypeColors: Record<string, string> = {
  "שכירות": "bg-blue-50 text-blue-700",
  "מכירה":  "bg-purple-50 text-purple-700",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function DealsTable({
  contracts,
  loading,
}: {
  contracts: Contract[];
  loading: boolean;
}) {
  const router = useRouter();
  const rows   = contracts.map(contractToDealRow);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">עסקאות אחרונות</h2>
          <p className="text-sm text-gray-500 mt-0.5">כל העסקאות הפעילות שלך</p>
        </div>
        <Link href="/contracts" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
          הצג הכל
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                שם לקוח
              </th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                סוג חוזה
              </th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                נכס
              </th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                סטטוס
              </th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                סכום
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                  טוען עסקאות...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                  אין עסקאות להצגה
                </td>
              </tr>
            ) : (
              rows.map((deal) => (
                <tr key={deal.id} onClick={() => router.push(`/contracts/${deal.contractId}`)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-semibold">
                          {deal.client.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{deal.client}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${contractTypeColors[deal.contractType] ?? "bg-gray-100 text-gray-600"}`}>
                      {deal.contractType}
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="text-sm text-gray-600 truncate max-w-[180px] block">{deal.property}</span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={deal.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-gray-900">{deal.amount}</span>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-indigo-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="19" cy="12" r="1" />
                        <circle cx="5" cy="12" r="1" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
