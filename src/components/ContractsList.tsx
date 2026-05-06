"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Contract } from "@/lib/contracts-data";
import type { SignatureStatus, PaymentStatus } from "@/lib/contracts-data";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";

// ─── Status badges ────────────────────────────────────────────────────────────

const SIG_STYLE: Record<SignatureStatus, { bg: string; text: string; dot: string }> = {
  טיוטה:         { bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400"    },
  נשלח:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"    },
  נפתח:          { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500"  },
  נחתם:          { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "ממתין לתשלום": { bg: "bg-amber-50",  text: "text-amber-700",   dot: "bg-amber-500"   },
  שולם:          { bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-500"    },
  "פג תוקף":     { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-300"    },
  בוטל:          { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-400"     },
};

const PAY_STYLE: Record<NonNullable<PaymentStatus>, { bg: string; text: string; dot: string }> = {
  "ממתין לתשלום": { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500"  },
  שולם:           { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  נכשל:           { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500"    },
  בוטל:           { bg: "bg-gray-100",  text: "text-gray-500",   dot: "bg-gray-400"   },
};

function StatusBadge({
  status,
  styleMap,
}: {
  status: string;
  styleMap: Record<string, { bg: string; text: string; dot: string }>;
}) {
  const s = styleMap[status] ?? { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

// ─── Contract type pill ───────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, string> = {
  "החתמת מתעניין":                "bg-blue-50 text-blue-700",
  "החתמת בעל נכס / בלעדיות":      "bg-purple-50 text-purple-700",
  "הסכם שיתוף פעולה בין מתווכים": "bg-teal-50 text-teal-700",
};

// ─── Filters ──────────────────────────────────────────────────────────────────

type FilterKey = "הכל" | "ממתינים לחתימה" | "נחתמו" | "ממתינים לתשלום" | "שולמו";

const FILTERS: FilterKey[] = ["הכל", "ממתינים לחתימה", "נחתמו", "ממתינים לתשלום", "שולמו"];

function matchesFilter(c: Contract, filter: FilterKey): boolean {
  if (filter === "הכל")             return true;
  // "ממתינים לחתימה" — link sent or opened but not yet signed
  if (filter === "ממתינים לחתימה") return c.signatureStatus === "נשלח" || c.signatureStatus === "נפתח";
  if (filter === "נחתמו")          return c.signatureStatus === "נחתם";
  // "ממתינים לתשלום" — contract-level PAYMENT_PENDING status
  if (filter === "ממתינים לתשלום") return c.signatureStatus === "ממתין לתשלום";
  // "שולמו" — contract-level PAID status
  if (filter === "שולמו")          return c.signatureStatus === "שולם";
  return true;
}

// ─── Next action derivation ───────────────────────────────────────────────────

function deriveNextAction(c: Contract): string {
  if (c.signatureStatus === "בוטל")           return "בוטל";
  if (c.signatureStatus === "פג תוקף")        return "פג תוקף";
  if (c.signatureStatus === "שולם")           return "הושלם ✓";
  if (c.signatureStatus === "ממתין לתשלום")   return "ממתין לאישור תשלום";
  if (c.signatureStatus === "נחתם" && c.dealClosed) return "שלח בקשת תשלום";
  if (c.signatureStatus === "נחתם")           return "סמן עסקה כנסגרה";
  if (c.signatureStatus === "נפתח")           return "ממתין לחתימת לקוח";
  if (c.signatureStatus === "נשלח")           return "ממתין לחתימת לקוח";
  return "השלם ושלח";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContractsList() {
  const [search, setSearch]             = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("הכל");
const [contracts, setContracts] = useState<Contract[]>([]);
const [loading, setLoading]     = useState(true);
const [error, setError]         = useState<string | null>(null);
const [deleteError, setDeleteError] = useState<string | null>(null);

useEffect(() => {
  async function fetchContracts() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/contracts");
      if (!res.ok) throw new Error("שגיאה בטעינת חוזים");
      const data: ApiContractResponse[] = await res.json();
      setContracts(data.map(apiToContract));
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  }
  fetchContracts();
}, []);
  const filtered = contracts.filter((c) => {
    const q = search.trim();
    const matchesSearch =
      q === "" || c.client.includes(q) || c.property.includes(q);
    return matchesSearch && matchesFilter(c, activeFilter);
  });
async function deleteContract(id: number | string) {
  const confirmed = window.confirm("למחוק את החוזה הזה? פעולה זו אינה ניתנת לביטול.");
  if (!confirmed) return;

  setDeleteError(null);
  try {
    const res = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error ?? "שגיאה במחיקת החוזה");
    }
    setContracts((prev) => prev.filter((c) => c.id !== id));
  } catch (err) {
    setDeleteError(err instanceof Error ? err.message : "שגיאה במחיקת החוזה. אנא נסה שוב.");
  }
}
  return (
    <>
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">חוזים</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול כל החוזים שנשלחו ללקוחות</p>
        </div>
        <Link
          href="/contracts/new"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          חוזה חדש
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Filters bar */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <svg
                className="absolute top-1/2 -translate-y-1/2 end-3 text-gray-400"
                width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="חיפוש לפי לקוח או נכס"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pe-9 ps-3.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeFilter === f
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {deleteError && (
            <div className="px-6 py-3 border-b border-red-100 bg-red-50">
              <p className="text-sm text-red-700">{deleteError}</p>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">לקוח</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">סוג חוזה</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell">נכס</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">סוג עסקה</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">סטטוס חתימה</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">סטטוס תשלום</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">עמלה</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">נשלח בתאריך</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-sm text-gray-500">
                      טוען חוזים...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-sm text-red-500">
                      {error}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-sm text-gray-500">
                      לא נמצאו חוזים התואמים את החיפוש
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    // Can send a payment request when signed+dealClosed and not yet in PAYMENT_PENDING/PAID
                    const paymentPending =
                      c.signatureStatus === "נחתם" && c.dealClosed;
                    const nextAction = deriveNextAction(c);

                    const paymentButtonLabel =
                      c.signatureStatus === "שולם"           ? "שולם ✓"
                      : c.signatureStatus === "ממתין לתשלום" ? "ממתין לתשלום"
                      : paymentPending                        ? "בקשת תשלום"
                      : c.signatureStatus === "נחתם" && !c.dealClosed ? "טרם נסגרה עסקה"
                      : "לא זמין";

                    const paymentButtonStyle =
                      c.signatureStatus === "שולם"
                        ? "bg-teal-50 text-teal-700 border border-teal-200 cursor-default"
                      : c.signatureStatus === "ממתין לתשלום"
                        ? "bg-amber-50 text-amber-700 border border-amber-200 cursor-default"
                      : paymentPending
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600"
                      : c.signatureStatus === "נחתם" && !c.dealClosed
                        ? "bg-amber-50 text-amber-700 border border-amber-200 cursor-default"
                      : "border border-gray-200 bg-white text-gray-400 cursor-default";
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* Client */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0">
                              <span className="text-white text-xs font-semibold">{c.client.charAt(0)}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{c.client}</span>
                          </div>
                        </td>

                        {/* Contract type */}
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${TYPE_STYLE[c.contractType] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.contractType}
                          </span>
                        </td>

                        {/* Property */}
                        <td className="px-4 py-4 hidden xl:table-cell">
                          <span className="text-sm text-gray-600 max-w-[180px] block truncate">{c.property}</span>
                        </td>

                        {/* Deal type */}
                        <td className="px-4 py-4 hidden md:table-cell">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            c.dealType === "שכירות" ? "bg-sky-50 text-sky-700" : "bg-purple-50 text-purple-700"
                          }`}>
                            {c.dealType}
                          </span>
                        </td>

                        {/* Signature status */}
                        <td className="px-4 py-4">
                          <StatusBadge status={c.signatureStatus} styleMap={SIG_STYLE} />
                        </td>

                        {/* Payment status */}
                        <td className="px-4 py-4">
                          {c.paymentStatus ? (
                            <StatusBadge status={c.paymentStatus} styleMap={PAY_STYLE} />
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Commission */}
                        <td className="px-4 py-4 hidden md:table-cell">
                          <span className="text-sm font-semibold text-gray-900">{c.commission}</span>
                        </td>

                        {/* Sent date */}
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <span className="text-sm text-gray-500">{c.sentDate}</span>
                        </td>

                        {/* Actions — always visible */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/contracts/${c.id}`}
                                className="px-2.5 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap"
                              >
                                צפייה
                              </Link>

                              {paymentPending ? (
                                <Link
                                  href={`/contracts/${c.id}`}
                                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${paymentButtonStyle}`}
                                >
                                  {paymentButtonLabel}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${paymentButtonStyle}`}
                                >
                                  {paymentButtonLabel}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => deleteContract(c.id)}
                                className="px-2.5 py-1.5 rounded-md border border-red-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 transition-all whitespace-nowrap"
                              >
                                מחק
                              </button>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">{nextAction}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-500">
             מציג {filtered.length} מתוך {contracts.length} חוזים
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
