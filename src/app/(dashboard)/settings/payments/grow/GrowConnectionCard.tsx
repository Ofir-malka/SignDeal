"use client";

/**
 * GrowConnectionCard — broker-facing Grow connection status + launch entry point.
 *
 * Reads GET /api/grow/onboarding/status and renders the current state. For states
 * that can connect, it shows GrowLaunchForm — which (on a real 201) stores the
 * launch in sessionStorage and navigates to the dedicated full-page screen at
 * /settings/payments/grow/onboarding. There is NO inline iframe here.
 *
 * Returning from a successful form submit lands here with ?submitted=1 → we show
 * an optimistic "Pending Verification" and poll /status (the server flips to
 * PENDING_VERIFICATION only on the inbound Grow callback — a later step).
 *
 * Safe fields only (the status endpoint never returns secrets).
 */

import { useCallback, useEffect, useState } from "react";
import { GrowLaunchForm } from "./GrowLaunchForm";

type GrowState =
  | "NOT_CONNECTED"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "CONNECTED"
  | "FAILED"
  | "EXPIRED";

interface GrowStatus {
  state: GrowState;
  isConnected: boolean;
  merchant: null | {
    packageId: string | null;
    trackingStatusId: string | null;
    growUserIdLast4: string | null;
    updatedAt: string;
  };
  session: null | {
    id: string;
    status: "PENDING" | "LINK_ISSUED" | "PENDING_VERIFICATION" | "COMPLETED" | "EXPIRED" | "FAILED";
    statusReason: string | null;
    businessNumberPreview: string | null;
    hasTrackingCode: boolean;
    createdAt: string;
    resolvedAt: string | null;
  };
}

const STATE_META: Record<
  GrowState,
  { label: string; badge: string; dot: string; title: string; desc: string }
> = {
  NOT_CONNECTED: {
    label: "לא מחובר",
    badge: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
    title: "חבר את חשבון הסליקה ל-Grow",
    desc: "כדי לקבל תשלומים מלקוחות דרך Grow, התחל את החיבור והשלם את טופס ההרשמה של Grow.",
  },
  IN_PROGRESS: {
    label: "בתהליך הרשמה",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    title: "ההרשמה ל-Grow בתהליך",
    desc: "ניתן להמשיך או להתחיל מחדש את תהליך ההרשמה.",
  },
  PENDING_VERIFICATION: {
    label: "ממתין לאישור Grow",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    title: "ההרשמה נשלחה — ממתינה לאימות Grow",
    desc: "קיבלנו את פרטי ההרשמה. החשבון יופעל לאחר אישור Grow.",
  },
  CONNECTED: {
    label: "מחובר",
    badge: "bg-green-100 text-green-700",
    dot: "bg-green-500",
    title: "החשבון מחובר ל-Grow",
    desc: "החשבון פעיל ומחובר לסליקת Grow.",
  },
  FAILED: {
    label: "נכשל",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    title: "ההרשמה ל-Grow נכשלה",
    desc: "ההרשמה לא הושלמה. ניתן לנסות שוב.",
  },
  EXPIRED: {
    label: "פג תוקף",
    badge: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
    title: "תוקף ההרשמה פג",
    desc: "תהליך ההרשמה פג תוקף. ניתן להתחיל מחדש.",
  },
};

const POLL_INTERVAL_MS = 5000;
const POLL_MAX = 24; // ~2 minutes

export function GrowConnectionCard({ initialSubmitted = false }: { initialSubmitted?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GrowStatus | null>(null);
  // `submitted` (optimistic "pending") comes from the server-read ?submitted=1 flag.
  const [submitted] = useState(initialSubmitted);
  const [polling, setPolling] = useState(initialSubmitted);

  const refresh = useCallback(async (): Promise<GrowState | null> => {
    try {
      const res = await fetch("/api/grow/onboarding/status", { credentials: "same-origin" });
      if (res.status === 401) {
        setError("נא להתחבר מחדש כדי לצפות בסטטוס.");
        return null;
      }
      if (!res.ok) {
        setError("טעינת סטטוס Grow נכשלה. נסה לרענן את הדף.");
        return null;
      }
      const json = (await res.json()) as GrowStatus;
      setData(json);
      setError(null);
      return json.state;
    } catch {
      setError("טעינת סטטוס Grow נכשלה. נסה לרענן את הדף.");
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      const st = await refresh();
      setLoading(false);
      if (st === "PENDING_VERIFICATION") setPolling(true);
    })();
  }, [refresh]);

  // Poll while pending (after submit, or if already pending on the server).
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts += 1;
      const st = await refresh();
      if (cancelled) return;
      if (st === "CONNECTED" || st === "FAILED" || st === "EXPIRED" || attempts >= POLL_MAX) {
        setPolling(false);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling, refresh]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-6 py-5">
        <p className="text-sm text-gray-700">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  // After a postMessage success the server still reports IN_PROGRESS until the
  // inbound callback arrives — show Pending Verification optimistically.
  const effectiveState: GrowState =
    submitted && (data.state === "NOT_CONNECTED" || data.state === "IN_PROGRESS")
      ? "PENDING_VERIFICATION"
      : data.state;

  const meta = STATE_META[effectiveState];
  const showLaunch =
    effectiveState === "NOT_CONNECTED" ||
    effectiveState === "FAILED" ||
    effectiveState === "EXPIRED" ||
    effectiveState === "IN_PROGRESS";

  return (
    <>
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${meta.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Grow</p>
            <p className="text-xs text-gray-500">סליקת תשלומים מלקוחות</p>
          </div>
        </div>

        <h2 className="text-base font-semibold text-gray-900 mb-2">{meta.title}</h2>
        <p className="text-sm text-gray-600 mb-5 leading-relaxed">{meta.desc}</p>

        {showLaunch && <GrowLaunchForm />}

        {effectiveState === "PENDING_VERIFICATION" && polling && (
          <p className="text-xs text-gray-400">בודק סטטוס…</p>
        )}
      </div>
    </>
  );
}
