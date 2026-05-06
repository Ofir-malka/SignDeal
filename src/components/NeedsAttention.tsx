"use client";

import Link from "next/link";
import { useState } from "react";
import type { Contract } from "@/lib/contracts-data";

type AttentionItem = {
  contract: Contract;
  label: string;
  style: string;
  type: "signing" | "close" | "payment";
};

function buildItems(contracts: Contract[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const c of contracts) {
    if (items.length >= 5) break;
    if (c.signatureStatus === "בוטל") continue;
    if (c.signatureStatus === "נשלח") {
      items.push({ contract: c, label: "ממתין לחתימת לקוח", style: "bg-amber-50 text-amber-700", type: "signing" });
    } else if (c.signatureStatus === "נחתם" && !c.dealClosed) {
      items.push({ contract: c, label: "צריך לסמן עסקה כנסגרה", style: "bg-orange-50 text-orange-700", type: "close" });
    } else if (c.signatureStatus === "נחתם" && c.dealClosed && c.paymentStatus !== "שולם") {
      items.push({ contract: c, label: "תשלום לגבייה", style: "bg-indigo-50 text-indigo-700", type: "payment" });
    }
  }
  return items;
}

export function NeedsAttention({
  contracts,
  loading,
}: {
  contracts: Contract[];
  loading: boolean;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds,   setSentIds]   = useState<Set<string>>(new Set());
  const [smsError,  setSmsError]  = useState<string | null>(null);

  async function sendPaySms(contractId: string | number) {
    const id = String(contractId);
    setSendingId(id);
    setSmsError(null);
    try {
      // G1.2: check res.ok and surface failures to the broker
      const res = await fetch(`/api/contracts/${id}/payment-request/send-sms`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSmsError(data.error ?? "שגיאה בשליחת SMS");
      } else {
        setSentIds(prev => new Set(prev).add(id));
      }
    } catch {
      setSmsError("שגיאה בשליחת SMS");
    } finally {
      setSendingId(null);
    }
  }

  if (loading) return null;

  const items = buildItems(contracts);
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <h2 className="text-sm font-semibold text-gray-900">דורש טיפול</h2>
        </div>
        <span className="text-xs text-gray-400">{items.length} פריטים</span>
      </div>

      {/* SMS error banner */}
      {smsError && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600">{smsError}</p>
        </div>
      )}

      {/* Items */}
      <div className="divide-y divide-gray-100">
        {items.map((item) => {
          const c = item.contract;
          return (
            <div key={c.id} className="px-6 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-semibold">{c.client.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.client}</p>
                <p className="text-xs text-gray-400 truncate">{c.property}</p>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${item.style}`}>
                {item.label}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {item.type === "payment" && (
                  <button
                    onClick={() => sendPaySms(c.id)}
                    disabled={sendingId === String(c.id) || sentIds.has(String(c.id))}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {sentIds.has(String(c.id)) ? "נשלח ✓" : sendingId === String(c.id) ? "שולח..." : "שלח SMS"}
                  </button>
                )}
                <Link
                  href={`/contracts/${c.id}`}
                  className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  פתח חוזה
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
