"use client";

// ── Type (mirrors GET /api/subscription/usage response) ───────────────────────
// Phase 1: response still uses backward-compat field names (activeCount, limit,
// remaining). Canonical names (monthlyDocCount, monthlyDocLimit, monthlyRemaining)
// added in Phase 2 when usage/route.ts is updated.
export interface UsageData {
  // Active plan values + deprecated values that may appear in old JWT tokens.
  plan:        "STANDARD" | "GROWTH" | "PRO" | "AGENCY" | "STARTER" | "ENTERPRISE";
  isTrialing:  boolean;
  isActive:    boolean;
  isExpired:   boolean;
  // Backward-compat field names (removed in Phase 2)
  activeCount: number;
  limit:       number | null;   // null = unlimited (AGENCY)
  remaining:   number | null;   // null = unlimited (AGENCY)
  trialEndsAt: string | null;   // ISO date string
  allowed:     boolean;
  reason?:     "SUBSCRIPTION_INACTIVE" | "CONTRACT_LIMIT_REACHED" | "MONTHLY_LIMIT_REACHED";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLAN_LABELS: Record<UsageData["plan"], string> = {
  // Active plan values (Phase 1+)
  STANDARD:   "Standard",
  GROWTH:     "Growth",
  PRO:        "Pro",
  AGENCY:     "Agency",
  // Deprecated — kept so stale JWT tokens don't render "undefined"
  STARTER:    "Starter",
  ENTERPRISE: "Enterprise",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct    = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color  =
    pct >= 100 ? "bg-red-500"
    : pct >= 67 ? "bg-amber-400"
    : "bg-indigo-500";

  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function UsageCard({ data }: { data: UsageData | null }) {
  // Skeleton while loading
  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
        <div className="h-3 w-24 rounded bg-gray-200 mb-2" />
        <div className="h-5 w-32 rounded bg-gray-200 mb-3" />
        <div className="h-2 w-full rounded bg-gray-200" />
      </div>
    );
  }

  const planLabel    = PLAN_LABELS[data.plan];
  const isUnlimited  = data.limit === null;
  const contractText = isUnlimited
    ? `${data.activeCount} חוזים פעילים`
    : `${data.activeCount} / ${data.limit} חוזים`;

  // Badge label
  let statusBadge = "";
  let badgeClass  = "";
  if (!data.isActive) {
    statusBadge = data.isExpired ? "פג תוקף" : "לא פעיל";
    badgeClass  = "bg-red-100 text-red-700";
  } else if (data.isTrialing) {
    statusBadge = "ניסיון";
    badgeClass  = "bg-violet-100 text-violet-700";
  } else {
    statusBadge = "פעיל";
    badgeClass  = "bg-emerald-100 text-emerald-700";
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            מסלול
          </span>
          <span className="text-sm font-bold text-gray-800">{planLabel}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
          {statusBadge}
        </span>
      </div>

      {/* Contract count */}
      <p className="text-sm text-gray-700 font-medium">{contractText}</p>

      {/* Progress bar — only when there's a limit */}
      {!isUnlimited && data.limit !== null && (
        <ProgressBar value={data.activeCount} max={data.limit} />
      )}

      {/* Remaining — only when limited and active */}
      {!isUnlimited && data.isActive && data.remaining !== null && (
        <p className="mt-1.5 text-xs text-gray-500">
          נותרו: <span className="font-semibold text-gray-700">{data.remaining}</span>
        </p>
      )}

      {/* Trial end date */}
      {data.isTrialing && data.trialEndsAt && (
        <p className="mt-1.5 text-xs text-gray-500">
          תקופת ניסיון עד:{" "}
          <span className="font-semibold text-gray-700">{fmtDate(data.trialEndsAt)}</span>
        </p>
      )}
    </div>
  );
}
