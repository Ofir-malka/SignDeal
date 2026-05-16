/**
 * /billing/success
 *
 * Post-payment landing page. Handles five distinct flows:
 *
 *   A. Stub        — query has stub=true (local dev only, no DB writes)
 *   B. Trial start — MAC verified + BillingCheckout found + INCOMPLETE→TRIALING
 *   C. Upgrade     — MAC verified + BillingCheckout found + TRIALING/ACTIVE→ACTIVE
 *   D. MAC failed  — responseMac missing or does not match
 *   E. Checkout error — checkout missing / expired / already resolved / mismatch
 *   F. Unknown     — no recognisable params (direct navigation / stale link)
 *
 * ── Activation flow (Phase 2C) ────────────────────────────────────────────────
 * On valid HYP callback:
 *   1. Verify responseMac using HYP_PASSP — BEFORE any DB read.
 *   2. Find BillingCheckout by uniqueID (= our Order param).
 *   3. Guards: not found / expired / already SUCCEEDED / already FAILED.
 *   4. Fetch current Subscription (pre-transition state for audit trail).
 *   5. Compute target state based on current status:
 *        INCOMPLETE  → TRIALING  (trial_started)  — card stored, trial clock starts
 *        TRIALING/ACTIVE → ACTIVE (payment_succeeded) — upgrade / re-activation
 *   6. prisma.$transaction() with atomic BillingCheckout guard (updateMany WHERE PENDING):
 *        - BillingCheckout  → SUCCEEDED, txId, hkId, cardToken, cardExp, cardMask, authNumber
 *        - Subscription     → status + card fields + billing dates (see bifurcation below)
 *        - SubscriptionEvent → trial_started | payment_succeeded
 *
 * ── INCOMPLETE → TRIALING (new trial) ────────────────────────────────────────
 *   Subscription updates:
 *     status           = TRIALING
 *     plan             = checkout.plan
 *     billingInterval  = checkout.interval
 *     billingProvider  = "hyp"
 *     billingSubscriptionId = HKId   (HYP recurring agreement — Phase 3 charge cursor)
 *     cardToken        = HKId        (same as billingSubscriptionId — used for charges)
 *     cardLast4        = last 4 of cardMask
 *     cardExpMonth/Year = parsed from cardExp (MMYY format)
 *     tokenCreatedAt   = now
 *     trialEndsAt      = now + 14 days
 *     nextBillingAt    = trialEndsAt (Phase 3 billing cron cursor)
 *
 * ── TRIALING/ACTIVE → ACTIVE (upgrade / re-activation) ───────────────────────
 *   Subscription updates:
 *     status               = ACTIVE
 *     plan + billingInterval + billingProvider + billingSubscriptionId
 *     card fields (refresh: cardToken, cardLast4, cardExpMonth/Year, tokenCreatedAt)
 *     firstPaymentAt       = now
 *     nextBillingAt        = currentPeriodEnd
 *     currentPeriodStart   = now
 *     currentPeriodEnd     = now + 1 month | 1 year
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 *   • responseMac verified BEFORE any DB read (prevents spoofed callbacks)
 *   • BillingCheckout.order is a UUID — hard to guess (prevents replay attacks)
 *   • All DB writes use checkout.userId (never a query param) → no cross-user risk
 *   • Atomic guard: updateMany WHERE status=PENDING prevents concurrent double-activation
 *   • Idempotency: SUCCEEDED checkout returns early without a second transaction
 */

import type { Metadata } from "next";
import Link              from "next/link";
import { prisma }        from "@/lib/prisma";
import { TRIAL_DAYS }    from "@/lib/plans";
import { verifyHypResponseMac } from "@/lib/billing/providers/hyp";
import type { HypCallbackParams } from "@/lib/billing/providers/hyp";

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

// ── Card field parser ─────────────────────────────────────────────────────────
//
// HYP callback fields used for card storage:
//   HKId      → cardToken (HYP recurring agreement ID — used for Phase 3 charges)
//   cardMask  → cardLast4 (strip non-digits, take last 4)
//   cardExp   → cardExpMonth + cardExpYear (MMYY format, e.g. "0328" → 3/2028)
//   cardBrand — HYP does not return brand; left null
//
// IMPORTANT: cardToken (HKId) is the Phase 3 charge cursor.
// Treat as sensitive: never log, never expose to client.

function parseCardFields(params: {
  HKId?:     string;
  cardToken?: string;
  cardMask?:  string;
  cardExp?:   string;
}): {
  cardToken:    string | null;
  cardLast4:    string | null;
  cardExpMonth: number | null;
  cardExpYear:  number | null;
} {
  // Prefer HKId (recurring agreement) as the persistent token for Phase 3 charges.
  const cardToken = params.HKId?.trim() || params.cardToken?.trim() || null;

  // Extract last 4 digits from cardMask (e.g. "411111*****1111" → "1111").
  let cardLast4: string | null = null;
  if (params.cardMask) {
    const digits = params.cardMask.replace(/\D/g, "");
    if (digits.length >= 4) cardLast4 = digits.slice(-4);
  }

  // Parse MMYY expiry (e.g. "0328" → month=3, year=2028).
  let cardExpMonth: number | null = null;
  let cardExpYear:  number | null = null;
  if (params.cardExp && /^\d{4}$/.test(params.cardExp)) {
    const month = parseInt(params.cardExp.slice(0, 2), 10);
    const year  = 2000 + parseInt(params.cardExp.slice(2, 4), 10);
    if (month >= 1 && month <= 12 && year >= 2020) {
      cardExpMonth = month;
      cardExpYear  = year;
    }
  }

  return { cardToken, cardLast4, cardExpMonth, cardExpYear };
}

// ── Shared card shell ─────────────────────────────────────────────────────────

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

// ── Flow A: Stub ─────────────────────────────────────────────────────────────

function StubSuccess({ plan, interval }: { plan: string; interval: string }) {
  const planLabel     = PLAN_LABELS[plan]     ?? plan;
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

// ── Flow B: Trial activation success (INCOMPLETE → TRIALING) ─────────────────

function TrialActivationSuccess({
  txId,
  plan,
  interval,
  authNumber,
  cardMask,
  trialEndsAt,
}: {
  txId:        string;
  plan:        string;
  interval:    string;
  authNumber?: string;
  cardMask?:   string;
  trialEndsAt: Date;
}) {
  const planLabel     = PLAN_LABELS[plan]     ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
  const trialEndStr   = formatHeDate(trialEndsAt);
  // Last 4 from cardMask for display
  const last4 = cardMask ? cardMask.replace(/\D/g, "").slice(-4) || null : null;

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
          <SummaryRow label="מסלול"              value={planLabel} />
          <SummaryRow label="חיוב"               value={intervalLabel} />
          <SummaryRow label="ניסיון מסתיים"      value={trialEndStr} />
          {last4      && <SummaryRow label="כרטיס"        value={`••••${last4}`} />}
          {authNumber && <SummaryRow label="מספר אישור"   value={authNumber} />}
          <SummaryRow label="מזהה עסקה"          value={txId} />
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

// ── Flow C: Upgrade / re-activation success (TRIALING/ACTIVE → ACTIVE) ────────

function UpgradeActivationSuccess({
  txId,
  plan,
  interval,
  authNumber,
  cardMask,
  periodEnd,
}: {
  txId:        string;
  plan:        string;
  interval:    string;
  authNumber?: string;
  cardMask?:   string;
  periodEnd:   Date;
}) {
  const planLabel     = PLAN_LABELS[plan]     ?? plan;
  const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
  const periodEndStr  = formatHeDate(periodEnd);
  const last4 = cardMask ? cardMask.replace(/\D/g, "").slice(-4) || null : null;

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
          <SummaryRow label="מסלול"      value={planLabel} />
          <SummaryRow label="חיוב"       value={intervalLabel} />
          <SummaryRow label="חידוש הבא"  value={periodEndStr} />
          {last4      && <SummaryRow label="כרטיס"        value={`••••${last4}`} />}
          {authNumber && <SummaryRow label="מספר אישור"   value={authNumber} />}
          <SummaryRow label="מזהה עסקה"  value={txId} />
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

// ── Idempotent: Already activated ────────────────────────────────────────────

function AlreadyActivated({ txId }: { txId: string }) {
  return (
    <>
      <div className="bg-emerald-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">המנוי כבר פעיל</h1>
            <p className="text-sm text-emerald-100 mt-0.5">
              התשלום כבר עובד ואושר קודם לכן.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">✅</span>
        </div>
      </div>
      <div className="px-6 py-6 flex flex-col gap-5">
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
          <SummaryRow label="מזהה עסקה" value={txId} />
        </div>
        <p className="text-sm text-center text-gray-500 leading-relaxed">
          הדף כבר עובד — נראה שנטענת פעמיים. המנוי שלך פעיל.
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

// ── Flow D: MAC verification failed ──────────────────────────────────────────

function HypVerificationFailed({ txId }: { txId?: string }) {
  return (
    <>
      <div className="bg-red-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">אימות התשלום נכשל</h1>
            <p className="text-sm text-red-100 mt-0.5">
              לא ניתן לאמת את פרטי העסקה.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">❌</span>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5">
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs font-semibold text-red-800 mb-0.5">מה קרה?</p>
          <p className="text-xs text-red-700 leading-relaxed">
            חתימת HYP לא תאמה לנתוני העסקה.
            ייתכן שהדף נפתח מחדש (הקישור תקף לשימוש אחד בלבד),
            או שהתגלתה בעיית אבטחה.
          </p>
          {txId && (
            <p className="text-xs text-red-600 mt-1.5 font-mono break-all">
              txId: {txId}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 leading-relaxed">
          אם חויבת, פנה לתמיכה עם מזהה העסקה למעלה.
        </p>

        <div className="flex flex-col gap-2">
          <Link
            href="/onboarding/billing"
            className="w-full text-center text-sm font-bold py-3 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            חזור לבחירת מסלול
          </Link>
          <a
            href="mailto:support@signdeal.co.il"
            className="w-full text-center text-sm py-2.5 rounded-xl
                       border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            פנה לתמיכה
          </a>
        </div>
      </div>
    </>
  );
}

// ── Flow E: Checkout lookup / activation errors ───────────────────────────────

type CheckoutErrorReason = "not_found" | "expired" | "failed" | "activation_error";

function CheckoutError({
  reason,
  txId,
}: {
  reason: CheckoutErrorReason;
  txId?:  string;
}) {
  const messages: Record<CheckoutErrorReason, { title: string; body: string }> = {
    not_found: {
      title: "סשן התשלום לא נמצא",
      body:  "לא נמצא סשן תשלום תואם. ייתכן שהסשן פג תוקף לפני שהגעת לדף זה.",
    },
    expired: {
      title: "סשן התשלום פג תוקף",
      body:  "הסשן תקף ל-30 דקות בלבד. אנא התחל את תהליך התשלום מחדש.",
    },
    failed: {
      title: "עסקה זו כבר נכשלה",
      body:  "סשן זה כבר סומן כנכשל. אנא נסה שנית.",
    },
    activation_error: {
      title: "שגיאה בהפעלת המנוי",
      body:  "התשלום אושר אך הייתה בעיה בהפעלת המנוי. צוות התמיכה יפנה אליך בהקדם.",
    },
  };

  const { title, body } = messages[reason];

  return (
    <>
      <div className="bg-amber-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
          <span className="text-4xl" aria-hidden="true">⚠️</span>
        </div>
      </div>
      <div className="px-6 py-6 flex flex-col gap-5">
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-800 leading-relaxed">{body}</p>
          {txId && (
            <p className="text-xs text-amber-600 mt-1.5 font-mono break-all">
              txId: {txId}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/onboarding/billing"
            className="w-full text-center text-sm font-bold py-3 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            נסה שנית ←
          </Link>
          <a
            href="mailto:support@signdeal.co.il"
            className="w-full text-center text-sm py-2.5 rounded-xl
                       border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            פנה לתמיכה
          </a>
        </div>
      </div>
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
    // Stub flow
    stub?:       string;
    plan?:       string;
    interval?:   string;
    // HYP callback params (appended by HYP to SuccessUrl)
    uniqueID?:   string;
    txId?:       string;
    cgUid?:      string;
    cardToken?:  string;
    cardExp?:    string;
    cardMask?:   string;
    personalId?: string;
    authNumber?: string;
    HKId?:       string;
    responseMac?: string;
  }>;
}) {
  const p = await searchParams;

  // ── Flow A: Stub (local dev / staging test) ───────────────────────────────
  if (p.stub === "true") {
    return (
      <PageShell>
        <StubSuccess plan={p.plan ?? ""} interval={p.interval ?? ""} />
      </PageShell>
    );
  }

  // ── Flows B–E: HYP callback ───────────────────────────────────────────────
  if (p.txId && p.uniqueID && p.responseMac) {
    const cbParams: HypCallbackParams = {
      uniqueID:    p.uniqueID,
      txId:        p.txId,
      cgUid:       p.cgUid,
      cardToken:   p.cardToken,
      cardExp:     p.cardExp,
      cardMask:    p.cardMask,
      personalId:  p.personalId,
      authNumber:  p.authNumber,
      HKId:        p.HKId,
      responseMac: p.responseMac,
    };

    const passp = process.env.HYP_PASSP?.trim() ?? "";

    console.log(
      `[billing/success] HYP callback received` +
      ` txId=${p.txId}` +
      ` uniqueID=${p.uniqueID}` +
      ` hasHKId=${Boolean(p.HKId)}` +
      ` hasCardMask=${Boolean(p.cardMask)}` +
      ` hasCardExp=${Boolean(p.cardExp)}` +
      ` hasAuthNumber=${Boolean(p.authNumber)}`,
    );

    // ── Step 1: verify MAC BEFORE any DB read ─────────────────────────────
    // This is the primary security gate. Prevents forged or tampered callbacks.
    if (!passp) {
      console.error("[billing/success] HYP_PASSP is not set — cannot verify responseMac.");
    }

    const macValid = passp ? verifyHypResponseMac(cbParams, passp) : false;
    console.log(`[billing/success] MAC verification: ${macValid ? "PASS" : "FAIL"}`);

    if (!macValid) {
      return (
        <PageShell>
          <HypVerificationFailed txId={p.txId} />
        </PageShell>
      );
    }

    // ── Step 2: look up BillingCheckout by order ──────────────────────────
    // BillingCheckout.order is the UUID we issued ("sd-<uuid>") — hard to guess.
    // All subsequent DB writes use checkout.userId, never a query param.
    const checkout = await prisma.billingCheckout.findUnique({
      where: { order: p.uniqueID },
    });

    console.log(
      `[billing/success] BillingCheckout lookup` +
      ` order=${p.uniqueID}` +
      ` found=${Boolean(checkout)}` +
      (checkout
        ? ` status=${checkout.status} expired=${checkout.expiresAt < new Date()}`
        : ""),
    );

    if (!checkout) {
      return (
        <PageShell>
          <CheckoutError reason="not_found" txId={p.txId} />
        </PageShell>
      );
    }

    if (checkout.expiresAt < new Date()) {
      return (
        <PageShell>
          <CheckoutError reason="expired" txId={p.txId} />
        </PageShell>
      );
    }

    // Idempotency: already SUCCEEDED → safe early return (page reload / double redirect).
    if (checkout.status === "SUCCEEDED") {
      console.log(`[billing/success] checkout already SUCCEEDED — idempotent response`);
      return (
        <PageShell>
          <AlreadyActivated txId={p.txId} />
        </PageShell>
      );
    }

    // Already FAILED
    if (checkout.status === "FAILED") {
      return (
        <PageShell>
          <CheckoutError reason="failed" txId={p.txId} />
        </PageShell>
      );
    }

    // ── Step 3: fetch pre-transition subscription state ───────────────────
    // Needed to bifurcate the activation path and to populate SubscriptionEvent
    // fromPlan / fromStatus for the audit trail.
    const subscription = await prisma.subscription.findUnique({
      where:  { userId: checkout.userId },
      select: { id: true, status: true, plan: true },
    });

    if (!subscription) {
      console.error(
        `[billing/success] subscription not found for userId=${checkout.userId} ` +
        `order=${p.uniqueID} — data integrity issue`,
      );
      return (
        <PageShell>
          <CheckoutError reason="activation_error" txId={p.txId} />
        </PageShell>
      );
    }

    // ── Step 4: determine activation path ────────────────────────────────
    // INCOMPLETE → TRIALING : first-time card, trial starts now (Phase 2C)
    // everything else → ACTIVE : upgrade, re-activation, or plan change
    const isTrialActivation = subscription.status === "INCOMPLETE";

    const now = new Date();

    // Parse card fields from callback
    const { cardToken, cardLast4, cardExpMonth, cardExpYear } = parseCardFields({
      HKId:      p.HKId,
      cardToken: p.cardToken,
      cardMask:  p.cardMask,
      cardExp:   p.cardExp,
    });

    // Compute billing dates — different for each path
    let trialEndsAt:      Date | null = null;
    let currentPeriodEnd: Date | null = null;

    if (isTrialActivation) {
      trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    } else {
      currentPeriodEnd = new Date(now);
      if (checkout.interval === "YEARLY") {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      } else {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      }
    }

    // ── Step 5: atomic activation transaction ────────────────────────────
    // The updateMany WHERE status=PENDING is the atomic guard against concurrent
    // double-activation (e.g. HYP retry + user reload racing).
    // If count=0 → someone else processed this checkout first.
    try {
      await prisma.$transaction(async (tx) => {

        // 5a. Mark checkout SUCCEEDED (atomic: only if still PENDING)
        const checkoutUpdate = await tx.billingCheckout.updateMany({
          where: { order: p.uniqueID!, status: "PENDING" },
          data: {
            status:     "SUCCEEDED",
            txId:       p.txId         ?? null,
            hkId:       p.HKId         ?? null,
            cardToken:  p.cardToken    ?? null,   // raw HYP cardToken
            cardExp:    p.cardExp      ?? null,   // raw MMYY expiry
            cardMask:   p.cardMask     ?? null,
            authNumber: p.authNumber   ?? null,
            resolvedAt: now,
          },
        });

        if (checkoutUpdate.count === 0) {
          // Another concurrent request already processed this checkout.
          throw new Error("ALREADY_PROCESSED");
        }

        // 5b. Update subscription — bifurcated by path
        if (isTrialActivation) {
          // ── INCOMPLETE → TRIALING ──────────────────────────────────────
          // Card stored; 14-day trial clock starts now.
          // No charge yet — trialEndsAt is also the Phase 3 billing cron cursor.
          await tx.subscription.update({
            where: { userId: checkout.userId },
            data: {
              status:               "TRIALING",
              plan:                 checkout.plan,
              billingInterval:      checkout.interval,
              billingProvider:      "hyp",
              billingSubscriptionId: p.HKId ?? null, // HK agreement ID — Phase 3 charge cursor
              // Card-on-file fields (Phase 2C)
              cardToken,       // = HKId — used by Phase 3 to charge via HYP HK
              cardLast4,
              cardExpMonth,
              cardExpYear,
              tokenCreatedAt:  now,
              // Trial timing
              trialEndsAt,
              nextBillingAt:   trialEndsAt, // Phase 3 cron will charge on this date
            },
          });
        } else {
          // ── TRIALING / ACTIVE → ACTIVE ────────────────────────────────
          // Upgrade or re-activation. First paid charge, period starts now.
          await tx.subscription.update({
            where: { userId: checkout.userId },
            data: {
              status:               "ACTIVE",
              plan:                 checkout.plan,
              billingInterval:      checkout.interval,
              billingProvider:      "hyp",
              billingSubscriptionId: p.HKId ?? null,
              // Refresh card-on-file (user may have entered a new card)
              cardToken,
              cardLast4,
              cardExpMonth,
              cardExpYear,
              tokenCreatedAt:     now,
              firstPaymentAt:     now,
              nextBillingAt:      currentPeriodEnd,
              currentPeriodStart: now,
              currentPeriodEnd,
            },
          });
        }

        // 5c. Append audit event
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: subscription.id,
            event:          isTrialActivation ? "trial_started" : "payment_succeeded",
            fromPlan:       subscription.plan,
            toPlan:         checkout.plan,
            fromStatus:     subscription.status,
            toStatus:       isTrialActivation ? "TRIALING" : "ACTIVE",
            source:         "hyp_callback",
            actorId:        null,
            metadata:       JSON.stringify({
              txId:       p.txId,
              hkId:       p.HKId       ?? null,
              authNumber: p.authNumber ?? null,
              order:      p.uniqueID,
              cardLast4,
              ...(isTrialActivation
                ? { trialDays: TRIAL_DAYS, trialEndsAt: trialEndsAt!.toISOString() }
                : { currentPeriodEnd: currentPeriodEnd!.toISOString() }
              ),
            }),
          },
        });
      });

      console.log(
        `[billing/success] activation SUCCESS` +
        ` path=${isTrialActivation ? "INCOMPLETE→TRIALING" : "→ACTIVE"}` +
        ` userId=${checkout.userId}` +
        ` plan=${checkout.plan}` +
        ` interval=${checkout.interval}` +
        ` txId=${p.txId}` +
        ` hkId=${p.HKId ?? "(none)"}` +
        (isTrialActivation
          ? ` trialEndsAt=${trialEndsAt!.toISOString()}`
          : ` periodEnd=${currentPeriodEnd!.toISOString()}`
        ),
      );

    } catch (err) {
      // Concurrent double-activation — show idempotent success, don't error out.
      if (err instanceof Error && err.message === "ALREADY_PROCESSED") {
        console.log(
          `[billing/success] ALREADY_PROCESSED (race condition) — idempotent response` +
          ` order=${p.uniqueID} txId=${p.txId}`,
        );
        return (
          <PageShell>
            <AlreadyActivated txId={p.txId} />
          </PageShell>
        );
      }

      console.error(
        "[billing/success] activation FAILED — transaction error:",
        err instanceof Error ? err.message : err,
        `userId=${checkout.userId} txId=${p.txId} order=${p.uniqueID}`,
      );
      return (
        <PageShell>
          <CheckoutError reason="activation_error" txId={p.txId} />
        </PageShell>
      );
    }

    // ── Step 6: render success ─────────────────────────────────────────────
    if (isTrialActivation) {
      return (
        <PageShell>
          <TrialActivationSuccess
            txId={p.txId}
            plan={checkout.plan}
            interval={checkout.interval}
            authNumber={p.authNumber}
            cardMask={p.cardMask}
            trialEndsAt={trialEndsAt!}
          />
        </PageShell>
      );
    }

    return (
      <PageShell>
        <UpgradeActivationSuccess
          txId={p.txId}
          plan={checkout.plan}
          interval={checkout.interval}
          authNumber={p.authNumber}
          cardMask={p.cardMask}
          periodEnd={currentPeriodEnd!}
        />
      </PageShell>
    );
  }

  // ── Flow F: Unknown / direct navigation ──────────────────────────────────
  return (
    <PageShell>
      <UnknownFlow />
    </PageShell>
  );
}
