"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { DashboardShell } from "@/components/DashboardShell";
import { DealsTable } from "@/components/DealsTable";
import { DashboardStats } from "@/components/DashboardStats";
import { NeedsAttention } from "@/components/NeedsAttention";
import type { Contract } from "@/lib/contracts-data";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";

function parseCommission(s: string): number {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? "";

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/contracts");
        if (!res.ok) throw new Error("שגיאה בטעינת נתונים");
        const data: ApiContractResponse[] = await res.json();
        setContracts(data.map(apiToContract));
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalContracts   = contracts.length;
  const signedContracts  = contracts.filter(c => c.signatureStatus === "נחתם").length;
  const pendingContracts = contracts.filter(c => c.signatureStatus === "נשלח").length;
  const totalRevenue     = contracts
    .filter(c => c.paymentStatus === "שולם")
    .reduce((sum, c) => sum + parseCommission(c.commission), 0);

  return (
    <DashboardShell>
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{firstName ? `שלום, ${firstName} 👋` : "שלום 👋"}</h1>
            <p className="text-sm text-gray-500 mt-0.5">סקירת הפעילות שלך לחודש אפריל 2026</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <button className="relative w-9 h-9 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* CTA button */}
            <Link href="/contracts/new" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              שלח חוזה חדש
            </Link>
          </div>
        </header>

        {/* Scrollable main content */}
        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Stats grid */}
          <DashboardStats
            contracts={contracts}
            loading={loading}
            error={error}
            totalContracts={totalContracts}
            signedContracts={signedContracts}
            pendingContracts={pendingContracts}
            totalRevenue={totalRevenue}
          />

          {/* Needs attention */}
          <NeedsAttention contracts={contracts} loading={loading} />

          {/* Quick action strip */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              הוסף חוזה
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="23" y1="11" x2="17" y2="11" />
                <line x1="20" y1="8" x2="20" y2="14" />
              </svg>
              לקוח חדש
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              דוח חודשי
            </button>
          </div>

          {/* Deals table */}
          <DealsTable contracts={contracts} loading={loading} />
        </main>
    </DashboardShell>
  );
}
