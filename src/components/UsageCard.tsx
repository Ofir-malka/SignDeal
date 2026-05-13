"use client";

// ── Type (mirrors GET /api/subscription/usage response) ───────────────────────
export interface UsageData {
  // Plan identity
  plan:      string;   // "STANDARD" | "GROWTH" | "PRO" | "AGENCY" (or stale JWT values)
  planLabel: string;   // Hebrew label from API e.g. "סטנדרט"
  isTrialing:  boolean;
  isActive:    boolean;
  isExpired:   boolean;
  trialEndsAt: string | null;   // ISO date string

  // Canonical monthly usage fields (Phase 2+)
  monthlyDocCount:  number;
  monthlyDocLimit:  number | null;   // null = AGENCY unlimited
  monthlyRemaining: number | null;   // null = unlimited; 0 when blocked

  // Backward-compat aliases (same values — deprecated)
  activeCount: number;
  limit:       number | null;
  remaining:   number | null;

  allowed: boolean;
  reason?: "SUBSCRIPTION_INACTIVE" | "CONTRACT_LIMIT_REACHED" | "MONTHLY_LIMIT_REACHED";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Days left until a future ISO date, floored to 0. */
function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ data }: { data: UsageData }) {
  let label: string;
  let cls: string;

  if (!data.isActive) {
    label = data.isExpired ? "לא פעיל" : "מוקפא";
    cls   = "bg-red-100 text-red-700";
  } else if (data.isTrialing) {
    label = "ניסיון";
    cls   = "bg-violet-100 text-violet-700";
  } else {
    label = "פעיל";
    cls   = "bg-emerald-100 text-emerald-700";
  }

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct   = Math.min(100, Math.round((used / limit) * 100));
  const color =
    pct >= 100 ? "bg-red-500"
    : pct >= 75 ? "bg-amber-400"
    : "bg-indigo-500";

  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
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
      <div className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse" dir="rtl">
        <div className="h-3 w-24 rounded bg-gray-200 mb-2" />
        <div className="h-5 w-32 rounded bg-gray-200 mb-3" />
        <div className="h-2 w-full rounded bg-gray-200" />
      </div>
    );
  }

  const isUnlimited = data.monthlyDocLimit === null;
  const days        = data.isTrialing && data.trialEndsAt ? daysLeft(data.trialEndsAt) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4" dir="rtl">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            מסלול
          </span>
          <span className="text-sm font-bold text-gray-900">
            {data.planLabel}
          </span>
        </div>
        <StatusBadge data={data} />
      </div>

      {/* ── Monthly document usage ── */}
      {data.isActive && (
        <div>
          {isUnlimited ? (
            <p className="text-sm text-gray-700 font-medium">
              {data.monthlyDocCount} חוזים החודש ·{" "}
              <span className="text-gray-400">ללא הגבלה</span>
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-gray-700 font-medium">
                  {data.monthlyDocCount} / {data.monthlyDocLimit} חוזים החודש
                </p>
                {data.monthlyRemaining !== null && data.monthlyRemaining > 0 && (
                  <span className="text-xs text-gray-400">
                    נותרו {data.monthlyRemaining}
                  </span>
                )}
                {data.monthlyRemaining === 0 && (
                  <span className="text-xs font-semibold text-red-600">
                    המכסה מלאה
                  </span>
                )}
              </div>
              <UsageBar used={data.monthlyDocCount} limit={data.monthlyDocLimit!} />
            </>
          )}
        </div>
      )}

      {/* ── Trial countdown ── */}
      {data.isTrialing && data.trialEndsAt && days !== null && (
        <p className="mt-2.5 text-xs text-gray-500">
          {days > 0 ? (
            <>
              <span className="font-semibold text-violet-700">{days}</span>
              {" "}{days === 1 ? "יום" : "ימים"} נותרו לתקופת הניסיון ·{" "}
              <span className="text-gray-400">עד {fmtDate(data.trialEndsAt)}</span>
            </>
          ) : (
            <span className="font-semibold text-red-600">תקופת הניסיון הסתיימה</span>
          )}
        </p>
      )}

      {/* ── Expired / inactive notice ── */}
      {!data.isActive && (
        <p className="mt-2 text-xs font-medium text-red-600">
          {data.isExpired
            ? "המנוי אינו פעיל. חוזים קיימים נגישים, אך לא ניתן ליצור חוזים חדשים."
            : "המנוי מוקפא. צור קשר לסיוע."}
        </p>
      )}

    </div>
  );
}
