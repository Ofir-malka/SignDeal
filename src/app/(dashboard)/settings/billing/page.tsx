/**
 * /settings/billing
 *
 * Billing settings page — Phase 1.
 *
 * Shows:
 *   1. Current subscription summary (plan, status, renewal / trial-end date).
 *   2. Upgrade panel with period toggle + plan cards → HYP checkout.
 *
 * Server component: reads subscription from DB directly (no extra round-trip).
 * The interactive upgrade panel is delegated to BillingUpgradeSection (client).
 */

import type { Metadata }          from "next";
import { redirect }               from "next/navigation";
import Link                       from "next/link";
import { auth }                   from "@/lib/auth";
import { prisma }                 from "@/lib/prisma";
import { DashboardShell }         from "@/components/DashboardShell";
import { BillingUpgradeSection }  from "./BillingUpgradeSection";

export const metadata: Metadata = {
  title: "מנוי וחיוב | SignDeal",
};

// ── Display helpers ───────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "סטנדרט",
  GROWTH:   "מתקדמת",
  PRO:      "פרו",
  AGENCY:   "AGENCY",
};

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "חודשי",
  YEARLY:  "שנתי",
};

const STATUS_LABELS: Record<string, string> = {
  INCOMPLETE: "נדרש אמצעי תשלום",  // Phase 2A: card not yet provided
  TRIALING:   "בניסיון חינם",
  ACTIVE:     "פעיל",
  PAST_DUE:   "חיוב נכשל",
  CANCELED:   "מבוטל",
  EXPIRED:    "לא פעיל",
};

const STATUS_COLORS: Record<string, string> = {
  INCOMPLETE: "bg-orange-50 text-orange-700 border-orange-200",
  TRIALING:   "bg-blue-50 text-blue-700 border-blue-200",
  ACTIVE:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  PAST_DUE:   "bg-amber-50 text-amber-700 border-amber-200",
  CANCELED:   "bg-gray-100 text-gray-500 border-gray-200",
  EXPIRED:    "bg-red-50 text-red-700 border-red-200",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  }).format(date);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Fetch latest subscription + last successful checkout (for card mask).
  const [sub, lastCheckout] = await Promise.all([
    prisma.subscription.findFirst({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      select: {
        plan:            true,
        status:          true,
        billingInterval: true,
        currentPeriodEnd: true,
        trialEndsAt:     true,
      },
    }),
    prisma.billingCheckout.findFirst({
      where:   { userId, status: "SUCCEEDED" },
      orderBy: { resolvedAt: "desc" },
      select:  { cardMask: true },
    }),
  ]);

  if (!sub) {
    // Extremely unlikely for an authenticated user; redirect to dashboard.
    redirect("/");
  }

  const planLabel     = PLAN_LABELS[sub.plan]     ?? sub.plan;
  const statusLabel   = STATUS_LABELS[sub.status] ?? sub.status;
  const statusColor   = STATUS_COLORS[sub.status] ?? STATUS_COLORS.EXPIRED;
  const intervalLabel = sub.billingInterval ? (INTERVAL_LABELS[sub.billingInterval] ?? sub.billingInterval) : null;
  const isActive      = sub.status === "ACTIVE";

  // Determine the date to surface:
  //   ACTIVE  → next renewal (currentPeriodEnd)
  //   TRIALING → trial end date
  //   otherwise → nothing meaningful to show
  const dateLabel = isActive && sub.currentPeriodEnd
    ? `חידוש הבא: ${formatDate(sub.currentPeriodEnd)}`
    : sub.status === "TRIALING" && sub.trialEndsAt
    ? `ניסיון מסתיים: ${formatDate(sub.trialEndsAt)}`
    : null;

  // Show upgrade panel for all self-serve plans (not AGENCY).
  const showUpgradePanel = sub.plan !== "AGENCY";

  return (
    <DashboardShell>
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">מנוי וחיוב</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול המנוי, שדרוג מסלול ופרטי חיוב</p>
        </div>
      </header>

      <main dir="rtl" className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 space-y-8">

        {/* ── Current subscription card ───────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">מנוי נוכחי</h2>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-wrap items-start gap-6 justify-between">

              {/* Left: plan + status */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-gray-900">{planLabel}</span>
                  <span
                    className={[
                      "inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border",
                      statusColor,
                    ].join(" ")}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                  {intervalLabel && (
                    <span>חיוב {intervalLabel}</span>
                  )}
                  {dateLabel && (
                    <span>{dateLabel}</span>
                  )}
                  {lastCheckout?.cardMask && (
                    <span>כרטיס: ••••{lastCheckout.cardMask.slice(-4)}</span>
                  )}
                </div>
              </div>

              {/* Right: pricing page link */}
              <Link
                href="/pricing"
                className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                צפה בכל המסלולים
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>

            </div>

            {/* Trial / expired CTA strip */}
            {sub.status === "TRIALING" && sub.trialEndsAt && (
              <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm text-gray-600">
                  תקופת הניסיון שלך מסתיימת ב-{formatDate(sub.trialEndsAt)}.{" "}
                  בחר מסלול כדי להמשיך ללא הפרעה.
                </p>
              </div>
            )}

            {(sub.status === "EXPIRED" || sub.status === "CANCELED") && (
              <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-gray-600">
                  המנוי אינו פעיל. בחר מסלול כדי להפעיל מחדש את הגישה.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Upgrade panel ──────────────────────────────────────────────────── */}
        {showUpgradePanel && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              {isActive ? "שינוי מסלול" : "בחר מסלול"}
            </h2>
            <BillingUpgradeSection
              currentPlan={sub.plan}
              isActive={isActive}
            />
          </section>
        )}

        {/* AGENCY — no self-serve upgrade available */}
        {sub.plan === "AGENCY" && (
          <section>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">מסלול AGENCY</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  לשינויים במסלול העסקי, צור קשר עם הצוות שלנו.
                </p>
              </div>
              <a
                href="mailto:support@signdeal.co.il"
                className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                צור קשר
              </a>
            </div>
          </section>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 leading-relaxed">
          המחירים לא כוללים מע״מ. חיוב שנתי מחויב בתשלום אחד מראש. ביטול אפשרי בכל עת — ראה{" "}
          <Link href="/legal/terms#cancellation" className="underline hover:text-gray-600">
            תנאי שימוש
          </Link>
          .
        </p>

      </main>
    </DashboardShell>
  );
}
