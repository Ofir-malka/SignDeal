"use client";

/**
 * GrowConnectionCard — broker-facing Grow connection STATUS UI (Step 2).
 *
 * Reads GET /api/grow/onboarding/status on mount and renders one of six states.
 * SAFE FIELDS ONLY (the endpoint never returns secrets): state, isConnected,
 * packageId, trackingStatusId, growUserIdLast4, session status/statusReason,
 * businessNumberPreview, hasTrackingCode, dates.
 *
 * ⚠ Step 2 scope: NO iframe, NO postMessage, and the Connect action is DISABLED
 *   ("coming soon"). It does NOT call /api/grow/onboarding/start.
 */

import { useEffect, useState } from "react";

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
    title: "החשבון אינו מחובר ל-Grow",
    desc: "חיבור חשבון הסליקה ל-Grow יתאפשר בקרוב, לאחר השלמת ההגדרה מול Grow.",
  },
  IN_PROGRESS: {
    label: "בתהליך הרשמה",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    title: "ההרשמה ל-Grow בתהליך",
    desc: "טופס ההרשמה נפתח. הסטטוס יתעדכן כאן לאחר ש-Grow יסיימו את האימות.",
  },
  PENDING_VERIFICATION: {
    label: "ממתין לאימות",
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
    desc: "ההרשמה לא הושלמה. ניתן יהיה לנסות שוב בקרוב.",
  },
  EXPIRED: {
    label: "פג תוקף",
    badge: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
    title: "תוקף ההרשמה פג",
    desc: "תהליך ההרשמה פג תוקף. ניתן יהיה להתחיל מחדש בקרוב.",
  },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function GrowConnectionCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GrowStatus | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/grow/onboarding/status", { credentials: "same-origin" });
        if (!active) return;
        if (res.status === 401) {
          setError("נא להתחבר מחדש כדי לצפות בסטטוס.");
          return;
        }
        if (!res.ok) {
          setError("טעינת סטטוס Grow נכשלה. נסה לרענן את הדף.");
          return;
        }
        const json = (await res.json()) as GrowStatus;
        if (active) setData(json);
      } catch {
        if (active) setError("טעינת סטטוס Grow נכשלה. נסה לרענן את הדף.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-6 py-5">
        <p className="text-sm text-gray-700">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const meta = STATE_META[data.state];
  const showConnect =
    data.state === "NOT_CONNECTED" || data.state === "FAILED" || data.state === "EXPIRED";

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

        {showConnect && (
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="חיבור ל-Grow יופעל לאחר השלמת ההגדרה מול Grow"
            className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl
                       text-sm font-bold text-gray-500 bg-gray-200 cursor-not-allowed"
          >
            בקרוב — בהמתנה להגדרת Grow
          </button>
        )}
      </div>

      {/* Safe details (only rendered when there is something to show) */}
      {(data.merchant || data.session) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">פרטי חיבור</h2>
          <div className="space-y-0 divide-y divide-gray-100">
            <DetailRow label="סטטוס" value={meta.label} />
            <DetailRow label="מחובר" value={data.isConnected ? "כן" : "לא"} />
            {data.session && <DetailRow label="סטטוס הרשמה" value={data.session.status} />}
            {data.session?.statusReason && (
              <DetailRow label="הערה" value={data.session.statusReason} />
            )}
            {data.session?.businessNumberPreview && (
              <DetailRow label="מספר עוסק" value={data.session.businessNumberPreview} />
            )}
            {data.merchant?.packageId && (
              <DetailRow label="קוד חבילה" value={data.merchant.packageId} />
            )}
            {data.merchant?.trackingStatusId && (
              <DetailRow label="קוד סטטוס" value={data.merchant.trackingStatusId} />
            )}
            {data.merchant?.growUserIdLast4 && (
              <DetailRow
                label="מזהה סליקה (4 ספרות אחרונות)"
                value={`••••${data.merchant.growUserIdLast4}`}
              />
            )}
            {data.session && (
              <DetailRow label="קוד מעקב קיים" value={data.session.hasTrackingCode ? "כן" : "לא"} />
            )}
            {data.session && (
              <DetailRow label="נוצר בתאריך" value={formatDate(data.session.createdAt)} />
            )}
            {data.session?.resolvedAt && (
              <DetailRow label="עודכן בתאריך" value={formatDate(data.session.resolvedAt)} />
            )}
            {data.merchant && (
              <DetailRow label="עדכון אחרון" value={formatDate(data.merchant.updatedAt)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
