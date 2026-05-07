"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Contract } from "@/lib/contracts-data";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";
import { AddClientModal, type NewClient } from "@/components/AddClientModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiClient = {
  id:       string;
  name:     string;
  phone:    string;
  email:    string;
  idNumber: string;
};

type ClientRow = {
  id:        string;   // DB primary key
  phone:     string;
  name:      string;
  email:     string;
  clientId:  string;   // idNumber (ת.ז.) for display
  contracts: Contract[];
  status:    string;
};

type StatusPriority = "ממתין לחתימה" | "ממתין לתשלום" | "פעיל" | "הושלם" | "טיוטה";

function deriveStatus(contracts: Contract[]): StatusPriority {
  if (contracts.length === 0) return "טיוטה";
  const statuses = contracts.map((c): StatusPriority => {
    if (c.signatureStatus === "נשלח")  return "ממתין לחתימה";
    if (c.paymentStatus === "ממתין לתשלום") return "ממתין לתשלום";
    if (c.signatureStatus === "נחתם" && c.paymentStatus === "שולם") return "הושלם";
    if (c.signatureStatus === "נחתם") return "פעיל";
    return "טיוטה";
  });

  const priority: StatusPriority[] = ["ממתין לחתימה", "ממתין לתשלום", "פעיל", "הושלם", "טיוטה"];
  for (const p of priority) {
    if (statuses.includes(p)) return p;
  }
  return "טיוטה";
}

function buildRows(clients: ApiClient[], contracts: Contract[]): ClientRow[] {
  const contractMap = new Map<string, Contract[]>();
  for (const c of contracts) {
    const group = contractMap.get(c.clientPhone) ?? [];
    group.push(c);
    contractMap.set(c.clientPhone, group);
  }
  return clients.map((cl) => {
    const group = contractMap.get(cl.phone) ?? [];
    return {
      id:        cl.id,
      phone:     cl.phone,
      name:      cl.name,
      email:     cl.email,
      clientId:  cl.idNumber,
      contracts: group,
      status:    deriveStatus(group),
    };
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  "ממתין לחתימה": { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  "ממתין לתשלום": { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500"  },
  "פעיל":         { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "הושלם":        { bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400"    },
  "טיוטה":        { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-300"    },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE["טיוטה"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientsList() {
  const [clients, setClients]         = useState<ApiClient[]>([]);
  const [contracts, setContracts]     = useState<Contract[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast]               = useState<string | null>(null);
  const toastTimerRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [res1, res2] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/contracts"),
        ]);
        if (!res1.ok || !res2.ok) throw new Error("שגיאה בטעינת הנתונים");
        const apiClients: ApiClient[]             = await res1.json();
        const apiContracts: ApiContractResponse[] = await res2.json();
        setClients(apiClients);
        setContracts(apiContracts.map(apiToContract));
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינת הנתונים");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function deleteClient(id: string, name: string) {
    if (!window.confirm(`למחוק את ${name}? פעולה זו אינה ניתנת לביטול.`)) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setDeleteError(body.error ?? "שגיאה במחיקה");
        return;
      }
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setDeleteError("שגיאה במחיקה");
    } finally {
      setDeleting(null);
    }
  }

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  function handleClientAdded(client: NewClient) {
    // Optimistic insert — slot in alphabetical order
    setClients((prev) => {
      const next = [
        ...prev,
        { id: client.id, name: client.name, phone: client.phone, email: client.email, idNumber: client.idNumber },
      ];
      return next.sort((a, b) => a.name.localeCompare(b.name, "he"));
    });
    setShowAddModal(false);
    showToast(`הלקוח "${client.name}" נוסף בהצלחה`);
  }

  const rows = buildRows(clients, contracts);
  const q = search.trim();
  const filtered = q === ""
    ? rows
    : rows.filter((r) =>
        r.name.includes(q) ||
        r.phone.includes(q) ||
        r.email.includes(q)
      );

  return (
    <>
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">לקוחות</h1>
          <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">ניהול כל הלקוחות שלך במקום אחד</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 sm:px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden sm:inline">הוסף לקוח</span>
          <span className="sm:hidden">הוסף</span>
        </button>
      </header>

      {/* Add-client modal */}
      {showAddModal && (
        <AddClientModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleClientAdded}
        />
      )}

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:right-6 sm:left-auto sm:max-w-sm z-50 pointer-events-none">
          <div className="flex items-center gap-3 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
            <svg className="shrink-0 text-emerald-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {toast}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-3 sm:px-8 py-4 sm:py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Search bar */}
          <div className="px-6 py-4 border-b border-gray-100">
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
                placeholder="חיפוש לפי שם, טלפון או אימייל"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pe-9 ps-3.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Delete error banner */}
          {deleteError && (
            <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-3">
              <span>{deleteError}</span>
              <button
                onClick={() => setDeleteError(null)}
                className="text-red-400 hover:text-red-600 shrink-0"
                aria-label="סגור"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto mt-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">לקוח</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">טלפון</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">אימייל</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell">ת.ז.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">חוזים</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">סטטוס</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-gray-400">
                      טוען לקוחות...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-red-500">
                      {error}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-gray-500">
                      {rows.length === 0 ? "אין לקוחות עדיין" : "לא נמצאו לקוחות התואמים את החיפוש"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0">
                            <span className="text-white text-xs font-semibold">{row.name.charAt(0)}</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{row.name}</span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-4 hidden md:table-cell">
                        <span className="text-sm text-gray-600 whitespace-nowrap">{row.phone}</span>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <span className="text-sm text-gray-600">{row.email}</span>
                      </td>

                      {/* ID */}
                      <td className="px-4 py-4 hidden xl:table-cell">
                        <span className="text-sm text-gray-500">{row.clientId}</span>
                      </td>

                      {/* Contract count */}
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                          {row.contracts.length}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <StatusBadge status={row.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href="/contracts"
                            className="px-2.5 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all whitespace-nowrap"
                          >
                            צפה בחוזים
                          </Link>
                          <button
                            onClick={() => deleteClient(row.id, row.name)}
                            disabled={deleting === row.id}
                            className="px-2.5 py-1.5 rounded-md border border-red-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                          >
                            {deleting === row.id ? "מוחק..." : "מחק"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              {loading ? "טוען..." : `מציג ${filtered.length} מתוך ${rows.length} לקוחות`}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
