/**
 * /settings/billing — User Billing Settings (Phase 3E)
 *
 * Shows the current user's subscription details and billing history.
 * Read-only — no cancel, card update, upgrade, downgrade, or retry.
 *
 * Server component: all data is fetched at render time via Prisma.
 * No client-side state, no loading spinner — the shell handles suspense.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * Every query is scoped to the current session userId.
 * The following field is intentionally excluded from every select:
 *   Subscription.chargeToken  — 19-digit HYP charge token; never expose to browser
 * It is commented below at the exact point it was considered and rejected.
 */

import type { Metadata }         from "next";
import { redirect }              from "next/navigation";
import Link                      from "next/link";
import { auth }                  from "@/lib/auth";
import { prisma }                from "@/lib/prisma";
import { DashboardShell }        from "@/components/DashboardShell";
import { BillingUpgradeSection } from "./BillingUpgradeSection";

export const metadata: Metadata = {
  title: "החיוב שלי | SignDeal",
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
  INCOMPLETE: "נדרש אמצעי תשלום",
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

const CHARGE_STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: "הצליח",
  FAILED:    "נכשל",
  PENDING:   "ממתין",
  SKIPPED:   "דולג",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
}

function agorotToShekel(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChargeBadge({ status }: { status: string }) {
  const label = CHARGE_STATUS_LABELS[status] ?? status;

  const cls =
    status === "SUCCEEDED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "FAILED"    ? "bg-red-50 text-red-700 border-red-200"             :
    status === "PENDING"   ? "bg-gray-100 text-gray-500 border-gray-200"         :
                             "bg-gray-50  text-gray-400 border-gray-200";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === "SUCCEEDED" ? "bg-emerald-500" :
        status === "FAILED"    ? "bg-red-500"     : "bg-gray-400"
      }`} />
      {label}
    </span>
  );
}

// ── Detail row used inside the subscription card ──────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-gray-500 shrink-0 w-40">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right">{children}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BillingSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // ── DB queries — scoped strictly to userId ─────────────────────────────────
  const [sub, charges] = await Promise.all([

    prisma.subscription.findFirst({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      select: {
        plan:            true,
        status:          true,
        billingInterval: true,
        billingFailures: true,

        trialEndsAt:      true,
        nextBillingAt:    true,
        currentPeriodEnd: true,
        firstPaymentAt:   true,
        tokenCreatedAt:   true,

        // Card display info — safe to show (last 4 only, no full PAN)
        cardLast4:    true,
        cardExpMonth: true,
        cardExpYear:  true,
        cardBrand:    true,

        // ── Intentionally NOT selected ───────────────────────────────────────
        // chargeToken — 19-digit HYP charge token; treat as sensitive credential
      },
    }),

    // Latest 10 BillingCharge rows for this user
    prisma.billingCharge.findMany({
      where:   { userId },
      take:    10,
      orderBy: { createdAt: "desc" },
      select: {
        id:          true,
        status:      true,
        amountAgorot: true,
        hypCCode:    true,
        hypAuthCode: true,
        periodStart: true,
        periodEnd:   true,
        createdAt:   true,
      },
    }),

  ]);

  if (!sub) redirect("/");

  // ── Derived display values ─────────────────────────────────────────────────

  const planLabel     = PLAN_LABELS[sub.plan]     ?? sub.plan;
  const statusLabel   = STATUS_LABELS[sub.status] ?? sub.status;
  const statusColor   = STATUS_COLORS[sub.status] ?? STATUS_COLORS.EXPIRED;
  const intervalLabel = INTERVAL_LABELS[sub.billingInterval] ?? sub.billingInterval;
  const isActive      = sub.status === "ACTIVE";

  // Card expiry display: "MM/YYYY"
  const cardExpiry =
    sub.cardExpMonth && sub.cardExpYear
      ? `${String(sub.cardExpMonth).padStart(2, "0")}/${sub.cardExpYear}`
      : null;

  // Payment method display: "•••• 1234 · MM/YYYY" or fallback
  const paymentMethodLabel =
    sub.cardLast4
      ? `•••• ${sub.cardLast4}${cardExpiry ? ` · ${cardExpiry}` : ""}`
      : null;

  // Next renewal / trial end label
  const nextEventLabel =
    isActive && sub.nextBillingAt
      ? { label: "חידוש הבא", date: sub.nextBillingAt }
      : sub.status === "TRIALING" && sub.trialEndsAt
      ? { label: "סיום ניסיון", date: sub.trialEndsAt }
      : null;

  const showUpgradePanel = sub.plan !== "AGENCY";

  return (
    <DashboardShell>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">החיוב שלי</h1>
          <p className="text-sm text-gray-500 mt-0.5">פרטי מנוי, אמצעי תשלום והיסטוריית חיובים</p>
        </div>
      </header>

      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Current subscription card ───────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">פרטי מנוי</h2>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Card top — plan name + status badge */}
            <div className="px-6 py-5 flex flex-wrap items-center gap-3 border-b border-gray-100">
              <span className="text-2xl font-black text-gray-900">{planLabel}</span>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                {statusLabel}
              </span>
              <div className="mr-auto">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  כל המסלולים
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Detail rows */}
            <div className="px-6 py-1">

              <DetailRow label="מסלול">
                {planLabel}
              </DetailRow>

              <DetailRow label="מחזור חיוב">
                {intervalLabel}
              </DetailRow>

              <DetailRow label="אמצעי תשלום">
                {paymentMethodLabel ?? (
                  <span className="text-gray-400 font-normal">לא נוסף אמצעי תשלום</span>
                )}
              </DetailRow>

              {nextEventLabel && (
                <DetailRow label={nextEventLabel.label}>
                  {formatDate(nextEventLabel.date)}
                </DetailRow>
              )}

              {sub.status === "TRIALING" && sub.trialEndsAt && (
                <DetailRow label="תאריך סיום ניסיון">
                  {formatDate(sub.trialEndsAt)}
                </DetailRow>
              )}

              {sub.cardBrand && (
                <DetailRow label="סוג כרטיס">
                  {sub.cardBrand}
                </DetailRow>
              )}

              {/* Billing failures — only show when non-zero */}
              {sub.billingFailures > 0 && (
                <DetailRow label="כשלונות חיוב">
                  <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-amber-500">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {sub.billingFailures} כשלון{sub.billingFailures > 1 ? "ות" : ""} ברצף
                  </span>
                </DetailRow>
              )}

              {sub.tokenCreatedAt && (
                <DetailRow label="כרטיס נרשם ב">
                  {formatDate(sub.tokenCreatedAt)}
                </DetailRow>
              )}

              {sub.firstPaymentAt && (
                <DetailRow label="תשלום ראשון">
                  {formatDate(sub.firstPaymentAt)}
                </DetailRow>
              )}

            </div>

            {/* Trial ending / Expired CTA strip */}
            {sub.status === "TRIALING" && sub.trialEndsAt && (
              <div className="mx-6 mb-5 mt-2 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm text-indigo-800 leading-relaxed">
                  תקופת הניסיון שלך מסתיימת ב-{formatDate(sub.trialEndsAt)}.{" "}
                  בחר מסלול כדי להמשיך ללא הפרעה.
                </p>
              </div>
            )}

            {(sub.status === "EXPIRED" || sub.status === "CANCELED") && (
              <div className="mx-6 mb-5 mt-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-red-800 leading-relaxed">
                  המנוי אינו פעיל. בחר מסלול כדי להפעיל מחדש את הגישה.
                </p>
              </div>
            )}

            {sub.status === "PAST_DUE" && (
              <div className="mx-6 mb-5 mt-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-0.5 shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">הגישה מושעית — חיוב נכשל</p>
                  <p className="text-sm text-red-700 mt-0.5 leading-relaxed">
                    כל ניסיונות החיוב נכשלו.{" "}
                    <Link
                      href="/settings/billing/recover"
                      className="underline font-semibold hover:text-red-900 transition-colors"
                    >
                      עדכן אמצעי תשלום
                    </Link>
                    {" "}להפעלת המנוי מחדש.
                  </p>
                </div>
              </div>
            )}

            {/* Payment method update CTA — healthy ACTIVE/TRIALING with no failures */}
            {(sub.status === "ACTIVE" || sub.status === "TRIALING") &&
              sub.billingFailures === 0 && (
              <div className="mx-6 mb-5 mt-2 border-t border-gray-50 pt-4 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {sub.cardLast4 ? "אמצעי תשלום" : "אין אמצעי תשלום"}
                </span>
                <Link
                  href="/settings/billing/payment-method"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  {sub.cardLast4 ? "החלפת אמצעי תשלום" : "הוספת אמצעי תשלום"}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>
            )}

            {/* Billing warning strip — shown for ACTIVE/TRIALING with 1–2 failures */}
            {sub.status !== "PAST_DUE" && sub.billingFailures > 0 && (
              <div className="mx-6 mb-5 mt-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-0.5 shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">
                    ניסיון חיוב נכשל ({sub.billingFailures} מתוך 3)
                  </p>
                  <p className="text-sm text-amber-700 mt-0.5 leading-relaxed">
                    <Link
                      href="/settings/billing/recover"
                      className="underline font-semibold hover:text-amber-900 transition-colors"
                    >
                      עדכן אמצעי תשלום
                    </Link>
                    {" "}כדי למנוע השעיית הגישה.
                  </p>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* ── Billing history ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">היסטוריית חיובים</h2>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {charges.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                    className="text-gray-400">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">אין חיובים עדיין</p>
                <p className="text-xs text-gray-400 mt-1">
                  חיובים יופיעו כאן לאחר תשלום ראשון
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3.5">
                        תאריך
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3.5">
                        סטטוס
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3.5">
                        סכום
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3.5 hidden sm:table-cell">
                        קוד HYP
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3.5 hidden md:table-cell">
                        אישור
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3.5 hidden lg:table-cell">
                        תקופת חיוב
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {charges.map((charge) => (
                      <tr key={charge.id} className="hover:bg-gray-50 transition-colors">

                        {/* Date */}
                        <td className="px-6 py-4">
                          <span className="text-gray-700 tabular-nums">
                            {formatDateShort(charge.createdAt)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <ChargeBadge status={charge.status} />
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-4">
                          <span className="font-semibold text-gray-900 tabular-nums">
                            {agorotToShekel(charge.amountAgorot)}
                          </span>
                        </td>

                        {/* CCode — hidden on mobile */}
                        <td className="px-4 py-4 hidden sm:table-cell">
                          <span className={`font-mono text-xs ${
                            charge.hypCCode === "0" ? "text-emerald-600" :
                            charge.hypCCode        ? "text-red-500"     : "text-gray-400"
                          }`}>
                            {charge.hypCCode ?? "—"}
                          </span>
                        </td>

                        {/* AuthCode — hidden on small screens */}
                        <td className="px-4 py-4 hidden md:table-cell">
                          <span className="font-mono text-xs text-gray-400">
                            {charge.hypAuthCode ?? "—"}
                          </span>
                        </td>

                        {/* Period — hidden on small/medium screens */}
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <span className="text-xs text-gray-500 tabular-nums">
                            {formatDateShort(charge.periodStart)}
                            {" – "}
                            {formatDateShort(charge.periodEnd)}
                          </span>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Upgrade panel (existing feature — keep intact) ─────────────── */}
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

        {/* AGENCY — no self-serve */}
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
        <p className="text-xs text-gray-400 leading-relaxed pb-4">
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
