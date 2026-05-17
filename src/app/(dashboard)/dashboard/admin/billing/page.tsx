"use client";

/**
 * /dashboard/admin/billing — Admin Billing Dashboard (Phase 3D.2)
 *
 * Read-only. No retry / cancel / edit actions.
 * Fetches from GET /api/admin/billing/overview (admin-gated server route).
 * If the session user is not an admin, the API returns 403 and we show a
 * dedicated access-denied state — no frontend role check needed.
 *
 * Component structure (all inline — no extra files needed):
 *   AdminBillingPage
 *     ├─ DashboardShell          (sidebar + layout)
 *     ├─ <header>                (page title + subtitle)
 *     ├─ Loading skeleton        (6 KPI pulses + table placeholders)
 *     ├─ AccessDenied            (403 state)
 *     ├─ ErrorBanner             (5xx / network state)
 *     └─ Data view
 *          ├─ KPI grid           (6 × StatsCard)
 *          ├─ LatestChargesTable (last 20 charges, any status)
 *          └─ FailedChargesTable (last 20 FAILED charges + retry state)
 */

import { useEffect, useState }  from "react";
import { DashboardShell }       from "@/components/DashboardShell";
import { StatsCard }            from "@/components/StatsCard";

// ── Response types (mirrors /api/admin/billing/overview exactly) ──────────────

interface BillingKpis {
  activeSubscriptions:         number;
  trialingSubscriptions:       number;
  pastDueSubscriptions:        number;
  failedChargesLast30Days:     number;
  monthlyRevenueAgorot:        number;
  upcomingRenewalsNext7Days:   number;
  /** Subscriptions with 1–2 billing failures (not yet PAST_DUE). Phase 3E. */
  billingWarningSubscriptions: number;
}

interface ChargeUser {
  id:    string;
  email: string;
  name:  string;
}

interface LatestCharge {
  id:           string;
  status:       string;
  amountAgorot: number;
  hypCCode:     string | null;
  hypAuthCode:  string | null;
  createdAt:    string;
  subscription: { id: string; plan: string };
  user:         ChargeUser;
}

interface FailedCharge {
  id:           string;
  amountAgorot: number;
  hypCCode:     string | null;
  createdAt:    string;
  subscription: {
    id:              string;
    plan:            string;
    status:          string;
    billingFailures: number;
    nextBillingAt:   string | null;
  };
  user: ChargeUser;
}

interface BillingOverview {
  kpis:          BillingKpis;
  latestCharges: LatestCharge[];
  failedCharges: FailedCharge[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function agorotToShekel(agorot: number): string {
  const shekel = agorot / 100;
  return `₪${shekel.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "סטנדרט",
  GROWTH:   "מתקדם",
  PRO:      "פרו",
  AGENCY:   "סוכנות",
};

const SUB_STATUS_LABELS: Record<string, string> = {
  ACTIVE:     "פעיל",
  TRIALING:   "ניסיון",
  PAST_DUE:   "בפיגור",
  CANCELED:   "בוטל",
  EXPIRED:    "פג תוקף",
  INCOMPLETE: "לא הושלם",
};

// ── Small reusable pieces ─────────────────────────────────────────────────────

function ChargeBadge({ status }: { status: string }) {
  if (status === "SUCCEEDED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        הצליח
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        נכשל
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        ממתין
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      {status}
    </span>
  );
}

function SubStatusBadge({ status }: { status: string }) {
  const label = SUB_STATUS_LABELS[status] ?? status;
  if (status === "PAST_DUE") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
        {label}
      </span>
    );
  }
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      {label}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8" aria-busy="true">
      {/* KPI skeleton — 7 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-3.5 bg-gray-100 rounded w-20 mb-2.5" />
                <div className="h-7 bg-gray-200 rounded w-12" />
              </div>
              <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />
            </div>
            <div className="mt-3 h-3 bg-gray-100 rounded w-24" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6 animate-pulse">
        <div className="h-14 border-b border-gray-100 px-6 flex items-center">
          <div className="h-4 bg-gray-200 rounded w-40" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
            <div className="h-4 bg-gray-100 rounded flex-1" />
            <div className="h-4 bg-gray-100 rounded w-16" />
            <div className="h-4 bg-gray-100 rounded w-20" />
            <div className="h-6 bg-gray-100 rounded-full w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Access denied state ───────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">גישה נדחתה</h2>
        <p className="text-sm text-gray-500">נדרשות הרשאות מנהל כדי לצפות בדף זה.</p>
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">שגיאה בטעינת הנתונים</h2>
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

// ── KPI section ───────────────────────────────────────────────────────────────

function KpiGrid({ kpis }: { kpis: BillingKpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
      <StatsCard
        title="מנויים פעילים"
        value={String(kpis.activeSubscriptions)}
        subtitle="סטטוס ACTIVE"
        accentColor="emerald"
        trend="neutral"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      />
      <StatsCard
        title="תקופות ניסיון"
        value={String(kpis.trialingSubscriptions)}
        subtitle="סטטוס TRIALING"
        accentColor="indigo"
        trend="neutral"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      />
      <StatsCard
        title="מנויים בבעיה"
        value={String(kpis.pastDueSubscriptions)}
        subtitle="סטטוס PAST_DUE"
        accentColor="amber"
        trend={kpis.pastDueSubscriptions > 0 ? "down" : "neutral"}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
      />
      <StatsCard
        title="חיובים שנכשלו"
        value={String(kpis.failedChargesLast30Days)}
        subtitle="30 הימים האחרונים"
        accentColor="orange"
        trend={kpis.failedChargesLast30Days > 0 ? "down" : "neutral"}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        }
      />
      <StatsCard
        title="הכנסות חודשיות"
        value={agorotToShekel(kpis.monthlyRevenueAgorot)}
        subtitle="30 הימים האחרונים"
        accentColor="emerald"
        trend="neutral"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
      <StatsCard
        title="חידושים קרובים"
        value={String(kpis.upcomingRenewalsNext7Days)}
        subtitle="7 הימים הקרובים"
        accentColor="indigo"
        trend="neutral"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        }
      />
      <StatsCard
        title="אזהרות תשלום"
        value={String(kpis.billingWarningSubscriptions)}
        subtitle="1–2 כישלונות, לא PAST_DUE"
        accentColor="orange"
        trend={kpis.billingWarningSubscriptions > 0 ? "down" : "neutral"}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
      />
    </div>
  );
}

// ── Latest charges table ──────────────────────────────────────────────────────

function LatestChargesTable({ charges }: { charges: LatestCharge[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      {/* Card header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">חיובים אחרונים</h2>
          <p className="text-xs text-gray-500 mt-0.5">20 החיובים האחרונים בכל הסטטוסים</p>
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
          {charges.length} רשומות
        </span>
      </div>

      {charges.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-gray-400">אין חיובים להצגה</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">משתמש</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">תוכנית</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">סכום</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">סטטוס</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">קוד HYP</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">AuthCode</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {charges.map((charge) => (
                <tr key={charge.id} className="hover:bg-gray-50 transition-colors">
                  {/* User */}
                  <td className="px-6 py-3.5">
                    <div className="font-medium text-gray-900 truncate max-w-[180px]">{charge.user.name}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[180px]">{charge.user.email}</div>
                  </td>
                  {/* Plan */}
                  <td className="px-4 py-3.5">
                    <span className="text-gray-700 font-medium">
                      {PLAN_LABELS[charge.subscription.plan] ?? charge.subscription.plan}
                    </span>
                  </td>
                  {/* Amount */}
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {agorotToShekel(charge.amountAgorot)}
                    </span>
                  </td>
                  {/* Status badge */}
                  <td className="px-4 py-3.5">
                    <ChargeBadge status={charge.status} />
                  </td>
                  {/* CCode */}
                  <td className="px-4 py-3.5">
                    <span className={`font-mono text-xs ${charge.hypCCode === "0" ? "text-emerald-600" : "text-red-600"}`}>
                      {charge.hypCCode ?? "—"}
                    </span>
                  </td>
                  {/* AuthCode */}
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-gray-500">
                      {charge.hypAuthCode ?? "—"}
                    </span>
                  </td>
                  {/* Date */}
                  <td className="px-4 py-3.5">
                    <span className="text-gray-500 text-xs tabular-nums">{formatDate(charge.createdAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Failed charges table ──────────────────────────────────────────────────────

function FailedChargesTable({ charges }: { charges: FailedCharge[] }) {
  return (
    <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-6 py-4 border-b border-red-50 flex items-center justify-between bg-red-50/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">חיובים שנכשלו</h2>
            <p className="text-xs text-gray-500 mt-0.5">מנויים הדורשים תשומת לב</p>
          </div>
        </div>
        {charges.length > 0 && (
          <span className="text-xs font-semibold text-red-700 bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">
            {charges.length} כשלונות
          </span>
        )}
      </div>

      {charges.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">אין חיובים שנכשלו</p>
          <p className="text-xs text-gray-400 mt-1">כל החיובים הצליחו</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">משתמש</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">סכום</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">קוד שגיאה</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">כשלונות</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">ניסיון הבא</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">סטטוס מנוי</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">תאריך כשלון</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {charges.map((charge) => (
                <tr key={charge.id} className="hover:bg-red-50/20 transition-colors">
                  {/* User */}
                  <td className="px-6 py-3.5">
                    <div className="font-medium text-gray-900 truncate max-w-[180px]">{charge.user.name}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[180px]">{charge.user.email}</div>
                  </td>
                  {/* Amount */}
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {agorotToShekel(charge.amountAgorot)}
                    </span>
                  </td>
                  {/* CCode */}
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-red-600 font-semibold">
                      {charge.hypCCode ?? "—"}
                    </span>
                  </td>
                  {/* Failure count */}
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      charge.subscription.billingFailures >= 3
                        ? "bg-red-100 text-red-700"
                        : charge.subscription.billingFailures === 2
                        ? "bg-orange-100 text-orange-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {charge.subscription.billingFailures}
                    </span>
                  </td>
                  {/* Next retry */}
                  <td className="px-4 py-3.5">
                    {charge.subscription.nextBillingAt ? (
                      <span className="text-xs text-gray-600 tabular-nums">
                        {formatDate(charge.subscription.nextBillingAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-red-500 font-medium">ללא ניסיון נוסף</span>
                    )}
                  </td>
                  {/* Subscription status */}
                  <td className="px-4 py-3.5">
                    <SubStatusBadge status={charge.subscription.status} />
                  </td>
                  {/* Failure date */}
                  <td className="px-4 py-3.5">
                    <span className="text-gray-500 text-xs tabular-nums">{formatDate(charge.createdAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const [data, setData]       = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/billing/overview")
      .then(async (res) => {
        if (res.status === 401) throw new Error("unauthenticated");
        if (res.status === 403) throw new Error("forbidden");
        if (!res.ok) throw new Error("שגיאת שרת — בדוק את הלוגים");
        return res.json() as Promise<BillingOverview>;
      })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "שגיאה לא ידועה"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell>
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">מערכת חיובים</h1>
          <p className="text-sm text-gray-500 mt-0.5">סקירת חיובים, מנויים והכנסות — Admin</p>
        </div>
        {/* Refresh button */}
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            setData(null);
            fetch("/api/admin/billing/overview")
              .then(async (res) => {
                if (res.status === 401) throw new Error("unauthenticated");
                if (res.status === 403) throw new Error("forbidden");
                if (!res.ok) throw new Error("שגיאת שרת — בדוק את הלוגים");
                return res.json() as Promise<BillingOverview>;
              })
              .then(setData)
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "שגיאה לא ידועה"))
              .finally(() => setLoading(false));
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          aria-label="רענן נתונים"
        >
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={loading ? "animate-spin" : ""}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span className="hidden sm:inline">רענן</span>
        </button>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading && <LoadingSkeleton />}

      {!loading && error === "forbidden" && <AccessDenied />}
      {!loading && error === "unauthenticated" && <AccessDenied />}
      {!loading && error && error !== "forbidden" && error !== "unauthenticated" && (
        <ErrorBanner message={error} />
      )}

      {!loading && !error && data && (
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8" dir="rtl">
          <KpiGrid kpis={data.kpis} />
          <LatestChargesTable charges={data.latestCharges} />
          <FailedChargesTable charges={data.failedCharges} />
        </main>
      )}
    </DashboardShell>
  );
}
