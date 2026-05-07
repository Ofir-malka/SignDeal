"use client";

import { StatsCard } from "@/components/StatsCard";
import type { Contract } from "@/lib/contracts-data";

function parseCommission(s: string): number {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

export function DashboardStats({
  contracts,
  loading,
  error,
}: {
  contracts: Contract[];
  loading:   boolean;
  error:     string | null;
}) {
  if (error) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-red-500 mb-8 bg-red-50 rounded-xl border border-red-100">
        <span>⚠️ {error}</span>
      </div>
    );
  }

  // ── Counts ──────────────────────────────────────────────────────────────────
  // Active = everything except CANCELED and EXPIRED
  const activeContracts  = contracts.filter(
    c => c.signatureStatus !== "בוטל" && c.signatureStatus !== "פג תוקף",
  ).length;

  // Pending signature = SENT or OPENED (client has the link)
  const pendingSig = contracts.filter(
    c => c.signatureStatus === "נשלח" || c.signatureStatus === "נפתח",
  ).length;

  // Pending payment = payment link sent, waiting for client to pay
  const pendingPay = contracts.filter(
    c => c.signatureStatus === "ממתין לתשלום",
  ).length;

  // Revenue this calendar month — paid contracts only
  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalRevenue = contracts
    .filter(c => {
      if (c.paymentStatus !== "שולם") return false;
      if (!c.paidAtRaw) return true; // no date → include rather than silently drop
      return new Date(c.paidAtRaw) >= monthStart;
    })
    .reduce((sum, c) => sum + parseCommission(c.commission), 0);

  // Attention note
  const parts: string[] = [];
  if (pendingSig > 0) parts.push(`${pendingSig} ממתינים לחתימה`);
  if (pendingPay > 0) parts.push(`${pendingPay} ממתינים לתשלום`);
  const attentionNote = parts.length > 0 ? `יש ${parts.join(" ו-")}` : "";

  const iconContract = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
  const iconSign = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
  const iconPay = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );

  return (
    <>
      <div className={`grid grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5 ${attentionNote ? "mb-3" : "mb-8"}`}>
        <StatsCard
          loading={loading}
          title="חוזים פעילים"
          value={String(activeContracts)}
          subtitle={activeContracts === 1 ? "חוזה אחד בתהליך" : `${activeContracts} חוזים בתהליך`}
          trend="neutral"
          accentColor="indigo"
          icon={iconContract}
        />
        <StatsCard
          loading={loading}
          title="ממתינים לחתימה"
          value={String(pendingSig)}
          subtitle={pendingSig > 0 ? `${pendingSig} חוזים ממתינים` : "אין ממתינים"}
          trend={pendingSig > 0 ? "up" : "neutral"}
          accentColor="amber"
          icon={iconSign}
        />
        <StatsCard
          loading={loading}
          title="ממתינים לתשלום"
          value={String(pendingPay)}
          subtitle={pendingPay > 0 ? `${pendingPay} עמלות לגבייה` : "אין ממתינים"}
          trend="neutral"
          accentColor="orange"
          featured={pendingPay > 0}
          icon={iconPay}
        />
        <StatsCard
          loading={loading}
          title="הכנסות החודש"
          value={totalRevenue > 0 ? `₪${totalRevenue.toLocaleString("he-IL")}` : "₪0"}
          subtitle="עמלות שהתקבלו החודש"
          trend={totalRevenue > 0 ? "up" : "neutral"}
          accentColor="emerald"
          icon={<span className="text-xl font-bold leading-none">₪</span>}
        />
      </div>

      {!loading && attentionNote && (
        <p className="text-sm text-amber-600 mb-8 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          {attentionNote}
        </p>
      )}
    </>
  );
}
