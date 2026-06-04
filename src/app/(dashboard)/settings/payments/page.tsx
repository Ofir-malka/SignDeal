/**
 * /settings/payments — Stripe Connect onboarding hub.
 *
 * Server component — Prisma query at render time, no client-side loading state.
 *
 * Renders one of four states based on BrokerStripeAccount.onboardingStatus:
 *   null          → no account; primary CTA to start onboarding
 *   PENDING       → account created but link never clicked; CTA to start
 *   IN_PROGRESS   → broker opened Stripe form but didn't finish; CTA to continue
 *   COMPLETE      → fully active; shows capability badges
 *   RESTRICTED    → Stripe flagged the account; shows warning + external link
 *
 * ⚠ This page is for Stripe Connect (client-to-broker brokerage payments).
 *   For SaaS subscription billing (HYP), see /settings/billing.
 */

import type { Metadata }    from "next";
import { redirect }         from "next/navigation";
import Link                 from "next/link";
import { auth }             from "@/lib/auth";
import { prisma }           from "@/lib/prisma";
import { DashboardShell }   from "@/components/DashboardShell";
import { ConnectButton }    from "./ConnectButton";

export const metadata: Metadata = {
  title:  "קבלת תשלומי עמלות | SignDeal",
  robots: { index: false, follow: false },
};

export default async function PaymentsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/settings/payments");
  const userId = session.user.id;

  const brokerAccount = await prisma.brokerStripeAccount.findUnique({
    where:  { userId },
    select: {
      onboardingStatus: true,
      chargesEnabled:   true,
      payoutsEnabled:   true,
      detailsSubmitted: true,
      stripeAccountId:  true,
      createdAt:        true,
    },
  });

  const status = brokerAccount?.onboardingStatus ?? null;

  // Recent payouts — only queried when account is COMPLETE (stripeAccountId guaranteed present)
  const recentPayouts = status === "COMPLETE" && brokerAccount?.stripeAccountId
    ? await prisma.stripePayoutEvent.findMany({
        where:   { stripeAccountId: brokerAccount.stripeAccountId },
        orderBy: { createdAt: "desc" },
        take:    5,
        select:  {
          payoutId:    true,
          status:      true,
          amount:      true,
          arrivalDate: true,
          failureCode: true,
        },
      })
    : [];

  return (
    <DashboardShell>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
        <Link
          href="/settings/billing"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="חזרה להגדרות"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">קבלת תשלומי עמלות</h1>
          <p className="text-sm text-gray-500 mt-0.5">חבר את חשבון הבנק שלך לקבלת תשלומים מלקוחות</p>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-lg mx-auto space-y-6">

          {/* ════ Grow — PRIMARY payment system (Israeli broker payments) ════════ */}
          <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm px-6 py-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">סליקת Grow</p>
                  <p className="text-xs text-gray-500">תשלומים לברוקרים בישראל</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 shrink-0">
                ראשי · חדש
              </span>
            </div>

            <h2 className="text-base font-semibold text-gray-900 mb-2">
              מערכת הסליקה הראשית לתשלומי ברוקרים בישראל
            </h2>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Grow היא מערכת הסליקה החדשה והראשית לקבלת תשלומים מלקוחות בישראל. החיבור נמצא כעת בהקמה — ניתן לצפות בסטטוס ולהמשיך מכאן.
            </p>

            <Link
              href="/settings/payments/grow"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl
                         text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700
                         transition-colors shadow-sm"
            >
              מעבר לחיבור Grow ←
            </Link>
          </div>

          {/* ════ Stripe — SECONDARY (international) ══════════════════════════════ */}
          <div className="pt-2">
            <h3 className="text-sm font-semibold text-gray-700">אפשרות משנית — תשלומים בינלאומיים (Stripe)</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Stripe נשאר זמין כאמצעי משני לתשלומים בינלאומיים. ההגדרות הקיימות נשמרות ללא שינוי.
            </p>
          </div>

          {/* ── COMPLETE state ─────────────────────────────────────────────── */}
          {status === "COMPLETE" && (
            <>
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  פעיל
                </span>
              </div>

              {/* Capabilities card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">חשבון Stripe מחובר</h2>
                <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                  חשבונך מחובר ופעיל. תוכל לקבל תשלומי עמלות מלקוחות ישירות לחשבון הבנק שלך.
                </p>

                <div className="space-y-3">
                  <CapabilityRow
                    label="קבלת תשלומים"
                    enabled={brokerAccount?.chargesEnabled ?? false}
                  />
                  <CapabilityRow
                    label="העברת כסף לחשבון בנק"
                    enabled={brokerAccount?.payoutsEnabled ?? false}
                  />
                </div>
              </div>

              {/* Recent payouts */}
              {recentPayouts.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
                  <h2 className="text-base font-semibold text-gray-900 mb-4">הפקדות אחרונות</h2>
                  <div className="space-y-0 divide-y divide-gray-100">
                    {recentPayouts.map((po) => (
                      <PayoutRow key={po.payoutId} payout={po} />
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <a
                      href="/payments"
                      className="text-xs text-indigo-600 hover:underline font-medium"
                    >
                      לכל התשלומים ←
                    </a>
                  </div>
                </div>
              )}

              {/* Stripe dashboard link */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 text-xs text-gray-500 leading-relaxed">
                לניהול חשבון Stripe, עדכון פרטי בנק, וצפייה בהיסטוריית תשלומים —{" "}
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline font-medium"
                >
                  כניסה לדשבורד Stripe
                </a>
              </div>
            </>
          )}

          {/* ── RESTRICTED state ───────────────────────────────────────────── */}
          {status === "RESTRICTED" && (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  מוגבל
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-6 py-5">
                <h2 className="text-base font-semibold text-gray-900 mb-3">חשבון Stripe מוגבל</h2>
                <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                  Stripe הגביל את חשבונך ונדרשים פרטים נוספים. אנא גש לדשבורד Stripe להשלמת הדרישות.
                </p>
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl
                             text-sm font-bold text-white bg-red-600 hover:bg-red-700
                             transition-colors shadow-sm"
                >
                  פתח דשבורד Stripe
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </>
          )}

          {/* ── IN_PROGRESS state ──────────────────────────────────────────── */}
          {status === "IN_PROGRESS" && (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  בתהליך הרשמה
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
                <h2 className="text-base font-semibold text-gray-900 mb-3">ממשיך בהרשמה ל-Stripe</h2>
                <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                  הרשמתך טרם הושלמה. לחץ להמשך ומלא את הפרטים הנדרשים ב-Stripe.
                </p>
                <ConnectButton label="המשך הרשמה ←" />
              </div>

              <InfoBox />
            </>
          )}

          {/* ── PENDING or no account ──────────────────────────────────────── */}
          {(status === null || status === "PENDING") && (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
                {/* Stripe + SignDeal logos */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Stripe Connect</p>
                    <p className="text-xs text-gray-500">תשלומים מאובטחים לחשבון הבנק שלך</p>
                  </div>
                </div>

                <h2 className="text-base font-semibold text-gray-900 mb-2">
                  קבל תשלומי עמלות ישירות לחשבון הבנק
                </h2>
                <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                  חבר את חשבון הבנק שלך באמצעות Stripe כדי לקבל תשלומי עמלות מלקוחות. ההרשמה אורכת כ-5 דקות.
                </p>

                <ConnectButton label="התחבר ל-Stripe ←" />
              </div>

              <InfoBox />
            </>
          )}

        </div>
      </main>
    </DashboardShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CapabilityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      {enabled ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          פעיל
        </span>
      ) : (
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
          לא פעיל
        </span>
      )}
    </div>
  );
}

type PayoutRowData = {
  payoutId:    string;
  status:      string;
  amount:      number;
  arrivalDate: Date | null;
  failureCode: string | null;
};

function PayoutRow({ payout: po }: { payout: PayoutRowData }) {
  const statusMap: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    paid:       { label: "הופקד",        bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    in_transit: { label: "בדרך לחשבון",  bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-400"    },
    pending:    { label: "ממתין",         bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
    failed:     { label: "נכשל",          bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500"     },
    canceled:   { label: "בוטל",          bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-400"    },
  };
  const s = statusMap[po.status] ?? statusMap.pending;

  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
        {po.arrivalDate && (
          <span className="text-xs text-gray-400">{formatDate(po.arrivalDate)}</span>
        )}
      </div>
      <span className="font-mono text-sm font-medium text-gray-900 shrink-0">
        {formatNIS(po.amount)}
      </span>
    </div>
  );
}

function formatNIS(agorot: number): string {
  return `₪${Math.round(agorot / 100).toLocaleString("he-IL")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function InfoBox() {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5 space-y-2 text-xs text-gray-500 leading-relaxed">
      <p className="font-medium text-gray-600">מה קורה בהרשמה?</p>
      <ul className="space-y-1.5 list-none">
        <li className="flex items-start gap-2">
          <span className="text-indigo-400 mt-0.5">•</span>
          Stripe תאמת את זהותך ופרטי חשבון הבנק שלך
        </li>
        <li className="flex items-start gap-2">
          <span className="text-indigo-400 mt-0.5">•</span>
          תשלומים מלקוחות יועברו ישירות לחשבון הבנק שלך
        </li>
        <li className="flex items-start gap-2">
          <span className="text-indigo-400 mt-0.5">•</span>
          ההרשמה מתבצעת בצורה מאובטחת דרך Stripe — SignDeal אינה שומרת פרטי בנק
        </li>
      </ul>
    </div>
  );
}
