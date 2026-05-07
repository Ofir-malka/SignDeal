"use client";

import Link from "next/link";
import { useState } from "react";
import type { Contract } from "@/lib/contracts-data";

// ── Attention item types ───────────────────────────────────────────────────────

type AttentionType = "signing" | "payment";

type AttentionItem = {
  contract: Contract;
  label:    string;
  style:    string;
  type:     AttentionType;
};

function buildItems(contracts: Contract[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const c of contracts) {
    if (items.length >= 6) break;
    switch (c.signatureStatus) {
      case "נשלח":
        items.push({
          contract: c,
          label:    "ממתין לחתימת לקוח",
          style:    "bg-amber-50 text-amber-700",
          type:     "signing",
        });
        break;
      case "נפתח":
        items.push({
          contract: c,
          label:    "לקוח פתח — טרם חתם",
          style:    "bg-blue-50 text-blue-700",
          type:     "signing",
        });
        break;
      case "ממתין לתשלום":
        items.push({
          contract: c,
          label:    "ממתין לתשלום",
          style:    "bg-orange-50 text-orange-700",
          type:     "payment",
        });
        break;
      default:
        break;
    }
  }
  return items;
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="px-6 py-3 flex items-center gap-3 animate-pulse">
      <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 bg-gray-100 rounded w-32" />
        <div className="h-3 bg-gray-100 rounded w-48" />
      </div>
      <div className="h-5 bg-gray-100 rounded w-24 shrink-0" />
      <div className="h-7 bg-gray-100 rounded w-16 shrink-0" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NeedsAttention({
  contracts,
  loading,
}: {
  contracts: Contract[];
  loading:   boolean;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds,   setSentIds]   = useState<Set<string>>(new Set());
  const [smsError,  setSmsError]  = useState<string | null>(null);

  async function sendPaySms(contractId: string | number) {
    const id = String(contractId);
    setSendingId(id);
    setSmsError(null);
    try {
      const res = await fetch(`/api/contracts/${id}/payment-request/send-sms`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setSmsError((data.error as string | undefined) ?? "שגיאה בשליחת SMS");
      } else {
        setSentIds(prev => new Set(prev).add(id));
      }
    } catch {
      setSmsError("שגיאה בשליחת SMS");
    } finally {
      setSendingId(null);
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
        <div className="px-6 py-3.5 border-b border-gray-100 flex items-center gap-2 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-gray-200" />
          <div className="h-4 bg-gray-100 rounded w-24" />
        </div>
        <div className="divide-y divide-gray-100">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  const items = buildItems(contracts);

  // Empty — nothing needs attention
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
        <div className="px-6 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between">
          <p className="text-xs text-red-600">{smsError}</p>
          <button onClick={() => setSmsError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* Items */}
      <div className="divide-y divide-gray-100">
        {items.map(({ contract: c, label, style, type }) => (
          <div key={c.id} className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">{c.client.charAt(0)}</span>
            </div>

            {/* Name + property */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{c.client}</p>
              <p className="text-xs text-gray-400 truncate">{c.property}</p>
            </div>

            {/* Status badge — hidden on very small screens */}
            <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${style}`}>
              {label}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {type === "payment" && (
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
                פתח
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
