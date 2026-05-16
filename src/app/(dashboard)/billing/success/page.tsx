/**
 * /billing/success
 *
 * Post-payment landing page — DB-driven (URLserver architecture).
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 * Activation no longer happens here. HYP fires a server-to-server GET to
 * /api/billing/hyp-notify BEFORE (or concurrent with) the browser redirect.
 * hyp-notify verifies the MAC, runs the atomic INCOMPLETE→TRIALING transaction,
 * and stores all card fields in the DB.
 *
 * This page only READS the DB and renders the appropriate UI based on the
 * subscription's current status. No params, no MAC verification needed.
 *
 * ── Flows ─────────────────────────────────────────────────────────────────────
 *   A. Stub        — query has stub=true (local dev / staging)
 *   B. TRIALING    — hyp-notify already activated: show trial success UI
 *   C. ACTIVE      — upgrade / re-activation already activated: show active UI
 *   D. INCOMPLETE  — hyp-notify hasn't fired yet: show PaymentPolling (client)
 *                    PaymentPolling calls router.refresh() every 3 s until
 *                    status changes to TRIALING / ACTIVE.
 *   E. No session  — shouldn't reach here (middleware blocks unauthenticated);
 *                    redirect to /login as fallback.
 *   F. Unknown     — direct navigation or unrecognised state.
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 *   All sensitive data (txId, cardLast4, plan) comes from our own DB, not
 *   from URL params. No MAC verification needed on this page.
 *   The hyp-notify route already did all security checks.
 */

import type { Metadata }  from "next";
import Link               from "next/link";
import { redirect }       from "next/navigation";
import { auth }           from "@/lib/auth";
import { prisma }         from "@/lib/prisma";
import { PaymentPolling } from "./PaymentPolling";

export const metadata: Metadata = {
  title:  "תוצאת תשלום | SignDeal",
  robots: { index: false, follow: false },
};

// ── Display helpers ───────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "סטנדרט",
  GROWTH:   "מתקדמת",
  PRO:      "פרו",
};

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "חודשי",
  YEARLY:  "שנתי",
};

function formatHeDate(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ── Shared page shell ─────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  );
}

// ── Flow A: Stub ──────────────────────────────────────────────────────────────

function StubSuccess({ plan, interval }: { plan: string; interval: string }) {
  const planLabel     = PLAN_LABELS[plan]         ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;

  return (
    <>
      <div className="mx-6 mt-6 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-2.5 flex items-center gap-2.5">
        <span className="text-lg" aria-hidden="true">🧪</span>
        <p className="text-xs font-semibold text-amber-800">
          TEST MODE — תשלום סטאב בלבד. לא בוצע חיוב אמיתי.
        </p>
      </div>

      <div className="bg-emerald-500 mx-6 mt-4 rounded-xl px-5 py-4 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <p className="text-base font-bold">תשלום הבדיקה אושר</p>
            {planLabel && (
              <p className="text-sm text-emerald-100 mt-0.5">מסלול {planLabel}</p>
            )}
          </div>
          <span className="text-3xl" aria-hidden="true">✅</span>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        {(planLabel || intervalLabel) && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 flex flex-col gap-2">
            {planLabel     && <SummaryRow label="מסלול" value={planLabel} />}
            {intervalLabel && <SummaryRow label="חיוב"  value={intervalLabel} />}
          </div>
        )}
        <p className="text-xs text-center text-gray-400">
          המנוי לא הופעל — זה היה תשלום בדיקה בלבד.
        </p>
        <Link
          href="/dashboard"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          עבור ללוח הבקרה →
        </Link>
      </div>
    </>
  );
}

// ── Flow B: Trial activation success (status = TRIALING) ─────────────────────

function TrialActivationSuccess({
  plan,
  interval,
  trialEndsAt,
  cardLast4,
  txId,
  authNumber,
}: {
  plan:         string;
  interval:     string;
  trialEndsAt:  Date;
  cardLast4?:   string | null;
  txId?:        string | null;
  authNumber?:  string | null;
}) {
  const planLabel     = PLAN_LABELS[plan]         ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
  const trialEndStr   = formatHeDate(trialEndsAt);

  return (
    <>
      {/* Header */}
      <div className="bg-emerald-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">ניסיון החינם שלך התחיל!</h1>
            <p className="text-sm text-emerald-100 mt-0.5">
              הכרטיס אושר. 14 יום ניסיון חינם מתחילים עכשיו.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">🎉</span>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5">

        {/* "No charge today" banner */}
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className="text-sm text-indigo-800 font-medium">לא חויבת היום</p>
        </div>

        {/* Trial summary */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 flex flex-col gap-2">
          <SummaryRow label="מסלול"         value={planLabel} />
          <SummaryRow label="חיוב"          value={intervalLabel} />
          <SummaryRow label="ניסיון מסתיים" value={trialEndStr} />
          {cardLast4  && <SummaryRow label="כרטיס"      value={`••••${cardLast4}`} />}
          {authNumber && <SummaryRow label="מספר אישור" value={authNumber} />}
          {txId       && <SummaryRow label="מזהה עסקה"  value={txId} />}
        </div>

        {/* How it works */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1.5 text-xs text-gray-500">
          <p>✓ יש לך 14 יום לנסות את כל תכונות המסלול.</p>
          <p>✓ לאחר {trialEndStr} יחויב המסלול שבחרת.</p>
          <p>✓ ניתן לבטל בכל עת מהגדרות → מנוי.</p>
        </div>

        <Link
          href="/dashboard"
          className="w-full text-center text-sm font-bold py-3.5 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          עבור ללוח הבקרה →
        </Link>

        <p className="text-center text-xs text-gray-400">
          שאלות?{" "}
          <a href="mailto:support@signdeal.co.il" className="text-indigo-500 hover:underline">
            support@signdeal.co.il
          </a>
        </p>
      </div>
    </>
  );
}

// ── Flow C: Upgrade / re-activation success (status = ACTIVE) ────────────────

function UpgradeActivationSuccess({
  plan,
  interval,
  currentPeriodEnd,
  cardLast4,
  txId,
  authNumber,
}: {
  plan:             string;
  interval:         string;
  currentPeriodEnd: Date;
  cardLast4?:       string | null;
  txId?:            string | null;
  authNumber?:      string | null;
}) {
  const planLabel     = PLAN_LABELS[plan]         ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
  const periodEndStr  = formatHeDate(currentPeriodEnd);

  return (
    <>
      <div className="bg-emerald-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">המנוי הופעל!</h1>
            <p className="text-sm text-emerald-100 mt-0.5">
              התשלום אושר והמנוי שלך פעיל.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">✅</span>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 flex flex-col gap-2">
          <SummaryRow label="מסלול"     value={planLabel} />
          <SummaryRow label="חיוב"      value={intervalLabel} />
          <SummaryRow label="חידוש הבא" value={periodEndStr} />
          {cardLast4  && <SummaryRow label="כרטיס"      value={`••••${cardLast4}`} />}
          {authNumber && <SummaryRow label="מספר אישור" value={authNumber} />}
          {txId       && <SummaryRow label="מזהה עסקה"  value={txId} />}
        </div>

        <Link
          href="/dashboard"
          className="w-full text-center text-sm font-bold py-3.5 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          עבור ללוח הבקרה →
        </Link>

        <p className="text-center text-xs text-gray-400">
          שאלות?{" "}
          <a href="mailto:support@signdeal.co.il" className="text-indigo-500 hover:underline">
            support@signdeal.co.il
          </a>
        </p>
      </div>
    </>
  );
}

// ── Flow D: Payment verifying (status = INCOMPLETE) ───────────────────────────
// Renders the polling client component inside a static shell.

function PaymentVerifying() {
  return (
    <>
      <div className="bg-indigo-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">מאמתים את התשלום</h1>
            <p className="text-sm text-indigo-100 mt-0.5">
              הכרטיס כנראה אושר — ממתינים לאישור מ-HYP.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">⏳</span>
        </div>
      </div>
      {/* PaymentPolling is a client component — polls router.refresh() every 3 s */}
      <PaymentPolling />
    </>
  );
}

// ── Flow F: Unknown / direct navigation ──────────────────────────────────────

function UnknownFlow() {
  return (
    <>
      <div className="bg-gray-400 px-6 py-5 text-white">
        <h1 className="text-xl font-bold text-right">דף לאחר תשלום</h1>
      </div>
      <div className="px-6 py-6 flex flex-col gap-4">
        <p className="text-sm text-gray-600 text-center leading-relaxed">
          הגעת לדף זה ישירות. אם ניסית לשלם, חזור לבחירת מסלול ונסה שנית.
        </p>
        <Link
          href="/onboarding/billing"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          בחר מסלול
        </Link>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    stub?:     string;
    plan?:     string;
    interval?: string;
  }>;
}) {
  const p = await searchParams;

  // ── Flow A: Stub (local dev / staging test) ───────────────────────────────
  // Preserved as-is: no DB hit, safe for dev environments.
  if (p.stub === "true") {
    return (
      <PageShell>
        <StubSuccess plan={p.plan ?? ""} interval={p.interval ?? ""} />
      </PageShell>
    );
  }

  // ── Auth: get session user ────────────────────────────────────────────────
  // Middleware ensures authenticated users only reach this page; redirect is a
  // safety net for unexpected direct navigation with no cookie.
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/billing/success");
  }
  const userId = session.user.id;

  // ── Query subscription from DB ────────────────────────────────────────────
  const subscription = await prisma.subscription.findUnique({
    where:  { userId },
    select: {
      status:           true,
      plan:             true,
      billingInterval:  true,
      trialEndsAt:      true,
      currentPeriodEnd: true,
      cardLast4:        true,
    },
  });

  if (!subscription) {
    console.error(`[billing/success] subscription not found — userId=${userId}`);
    return <PageShell><UnknownFlow /></PageShell>;
  }

  // ── Query most-recent SUCCEEDED checkout for display fields ───────────────
  // txId and authNumber are stored in BillingCheckout by hyp-notify.
  // These are display-only — subscription activation already happened.
  const latestCheckout = await prisma.billingCheckout.findFirst({
    where:   { userId, status: "SUCCEEDED" },
    orderBy: { resolvedAt: "desc" },
    select:  { txId: true, authNumber: true },
  });

  // ── Render based on DB subscription status ────────────────────────────────

  const { status, plan, billingInterval } = subscription;

  console.log(
    `[billing/success] rendering` +
    ` userId=${userId.slice(0, 8)}…` +
    ` status=${status}` +
    ` plan=${plan}` +
    ` interval=${billingInterval}`,
  );

  // Flow B: TRIALING — hyp-notify activated the trial
  if (status === "TRIALING" && subscription.trialEndsAt) {
    return (
      <PageShell>
        <TrialActivationSuccess
          plan={plan}
          interval={billingInterval}
          trialEndsAt={subscription.trialEndsAt}
          cardLast4={subscription.cardLast4}
          txId={latestCheckout?.txId}
          authNumber={latestCheckout?.authNumber}
        />
      </PageShell>
    );
  }

  // Flow C: ACTIVE — upgrade / re-activation
  if (status === "ACTIVE" && subscription.currentPeriodEnd) {
    return (
      <PageShell>
        <UpgradeActivationSuccess
          plan={plan}
          interval={billingInterval}
          currentPeriodEnd={subscription.currentPeriodEnd}
          cardLast4={subscription.cardLast4}
          txId={latestCheckout?.txId}
          authNumber={latestCheckout?.authNumber}
        />
      </PageShell>
    );
  }

  // Flow D: INCOMPLETE — hyp-notify hasn't fired yet; poll until it does
  if (status === "INCOMPLETE") {
    return (
      <PageShell>
        <PaymentVerifying />
      </PageShell>
    );
  }

  // Flow F: any other status — shouldn't normally reach here
  return <PageShell><UnknownFlow /></PageShell>;
}
