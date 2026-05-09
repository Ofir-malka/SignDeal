"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { DashboardShell } from "@/components/DashboardShell";
import { DealsTable }      from "@/components/DealsTable";
import { DashboardStats }  from "@/components/DashboardStats";
import { NeedsAttention }  from "@/components/NeedsAttention";
import { RecentActivity }  from "@/components/RecentActivity";
import type { Contract } from "@/lib/contracts-data";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";

// Dynamic "Month Year" label in Hebrew, e.g. "מאי 2026"
function currentMonthLabel(): string {
  return new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? "";

  const [contracts, setContracts]           = useState<Contract[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [failedMsgCount, setFailedMsgCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        // Fetch contracts and failed-message count in parallel
        const [contractsRes, msgsRes] = await Promise.all([
          fetch("/api/contracts"),
          fetch("/api/messages?status=FAILED&limit=1"),
        ]);

        if (!contractsRes.ok) throw new Error("שגיאה בטעינת נתונים");
        const data: ApiContractResponse[] = await contractsRes.json();
        setContracts(data.map(apiToContract));

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json() as { summary?: { failedCount?: number } };
          setFailedMsgCount(msgsData.summary?.failedCount ?? 0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <DashboardShell>
      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {firstName ? `שלום, ${firstName} 👋` : "שלום 👋"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            סקירת הפעילות שלך — {currentMonthLabel()}
          </p>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/contracts/new"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold px-4 sm:px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="hidden sm:inline">שלח חוזה חדש</span>
            <span className="sm:hidden">חוזה</span>
          </Link>
        </div>
      </header>

      {/* ── Scrollable main content ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">

        {/* Stats grid */}
        <DashboardStats contracts={contracts} loading={loading} error={error} />

        {/* Needs attention */}
        <NeedsAttention contracts={contracts} loading={loading} failedNotificationsCount={failedMsgCount} />

        {/* Quick action strip */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-8">
          <Link
            href="/contracts/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            חוזה חדש
          </Link>
          <Link
            href="/clients"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="23" y1="11" x2="17" y2="11" />
              <line x1="20" y1="8" x2="20" y2="14" />
            </svg>
            לקוח חדש
          </Link>
          <Link
            href="/contracts"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            כל החוזים
          </Link>
        </div>

        {/* Two-column layout on large screens: recent activity + deals table */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent activity — 1/3 width on xl */}
          <div className="xl:col-span-1">
            <RecentActivity contracts={contracts} loading={loading} />
          </div>

          {/* Deals table — 2/3 width on xl */}
          <div className="xl:col-span-2">
            <DealsTable contracts={contracts} loading={loading} />
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}
