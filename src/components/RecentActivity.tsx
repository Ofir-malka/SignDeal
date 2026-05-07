"use client";

import Link from "next/link";
import type { Contract } from "@/lib/contracts-data";

// ── Activity event ─────────────────────────────────────────────────────────────

type ActivityEvent = {
  id:        string;
  label:     string;
  sub:       string;
  dateStr:   string;
  ts:        number;   // unix ms — for sorting
  dotColor:  string;
  contractId: string | number;
};

function buildEvents(contracts: Contract[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const c of contracts) {
    // Payment received
    if (c.paidAtRaw) {
      events.push({
        id:         `paid-${c.id}`,
        label:      `תשלום התקבל — ${c.client}`,
        sub:        c.commission,
        dateStr:    c.paidDate ?? "",
        ts:         new Date(c.paidAtRaw).getTime(),
        dotColor:   "bg-emerald-500",
        contractId: c.id,
      });
    }

    // Contract signed
    if (c.signedAtRaw) {
      events.push({
        id:         `signed-${c.id}`,
        label:      `${c.client} חתם על החוזה`,
        sub:        c.property,
        dateStr:    c.signedDate ?? "",
        ts:         new Date(c.signedAtRaw).getTime(),
        dotColor:   "bg-indigo-500",
        contractId: c.id,
      });
    }

    // Contract created
    events.push({
      id:         `created-${c.id}`,
      label:      `חוזה חדש נוצר — ${c.client}`,
      sub:        c.property,
      dateStr:    c.createdDate,
      ts:         new Date(c.createdAtRaw).getTime(),
      dotColor:   "bg-gray-300",
      contractId: c.id,
    });
  }

  return events
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8);
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 animate-pulse">
      <div className="w-2 h-2 rounded-full bg-gray-200 mt-1.5 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-gray-100 rounded w-48" />
        <div className="h-3 bg-gray-100 rounded w-32" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-14 shrink-0" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RecentActivity({
  contracts,
  loading,
}: {
  contracts: Contract[];
  loading:   boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">פעילות אחרונה</h2>
        <Link href="/contracts" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
          כל החוזים
        </Link>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="space-y-4">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : (() => {
          const events = buildEvents(contracts);

          if (events.length === 0) {
            return (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">עדיין אין פעילות להצגה</p>
                <Link
                  href="/contracts/new"
                  className="text-sm text-indigo-600 font-medium hover:text-indigo-700"
                >
                  צור את החוזה הראשון שלך →
                </Link>
              </div>
            );
          }

          return (
            <div className="space-y-3.5">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/contracts/${ev.contractId}`}
                  className="flex items-start gap-3 group"
                >
                  <span className={`w-2 h-2 rounded-full ${ev.dotColor} mt-1.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 group-hover:text-indigo-600 transition-colors truncate">
                      {ev.label}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{ev.sub}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 pt-0.5">
                    {ev.dateStr}
                  </span>
                </Link>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
