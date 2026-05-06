"use client";

import { StatsCard } from "@/components/StatsCard";
import type { Contract } from "@/lib/contracts-data";

function buildAttentionNote(pendingContracts: number, pendingPay: number): string {
  if (pendingContracts > 0 && pendingPay > 0)
    return `יש ${pendingContracts} חוזים שממתינים לחתימה ו-${pendingPay} תשלומים לגבייה`;
  if (pendingContracts > 0)
    return `יש ${pendingContracts} חוזים שממתינים לחתימה`;
  if (pendingPay > 0)
    return `יש ${pendingPay} תשלומים לגבייה`;
  return "";
}

export function DashboardStats({
  contracts,
  loading,
  error,
  totalContracts,
  signedContracts,
  pendingContracts,
  totalRevenue,
}: {
  contracts:       Contract[];
  loading:         boolean;
  error:           string | null;
  totalContracts:  number;
  signedContracts: number;
  pendingContracts: number;
  totalRevenue:    number;
}) {
  if (loading) {
    return <div className="h-32 flex items-center justify-center text-sm text-gray-400 mb-8">טוען נתונים...</div>;
  }

  if (error) {
    return <div className="h-32 flex items-center justify-center text-sm text-red-500 mb-8">{error}</div>;
  }

  const pendingPay = contracts.filter(
    c => c.signatureStatus === "נחתם" && c.dealClosed && c.paymentStatus !== "שולם"
  ).length;

  const attentionNote = buildAttentionNote(pendingContracts, pendingPay);

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 ${attentionNote ? "mb-3" : "mb-8"}`}>
        <StatsCard
          title="עסקאות פעילות"
          value={String(totalContracts)}
          subtitle={`${totalContracts} עסקאות בתהליך`}
          trend="neutral"
          accentColor="indigo"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          }
        />
        <StatsCard
          title="ממתינים לחתימה"
          value={String(pendingContracts)}
          subtitle={pendingContracts > 0 ? `${pendingContracts} חוזים ממתינים` : "אין ממתינים"}
          trend={pendingContracts > 0 ? "up" : "neutral"}
          accentColor="amber"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          }
        />
        <StatsCard
          title="ממתינים לתשלום"
          value={String(pendingPay)}
          subtitle={pendingPay > 0 ? `${pendingPay} עמלות לגבייה` : "אין ממתינים"}
          trend="neutral"
          accentColor="orange"
          featured={pendingPay > 0}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          }
        />
        <StatsCard
          title="הכנסות החודש"
          value={totalRevenue > 0 ? `₪${totalRevenue.toLocaleString("he-IL")}` : "₪0"}
          subtitle="עמלות שהתקבלו"
          trend={totalRevenue > 0 ? "up" : "neutral"}
          accentColor="emerald"
          icon={<span className="text-xl font-bold leading-none">₪</span>}
        />
      </div>
      {attentionNote && (
        <p className="text-sm text-gray-500 mb-8">{attentionNote}</p>
      )}
    </>
  );
}
