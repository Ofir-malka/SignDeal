/**
 * /billing/success
 *
 * Post-payment landing page. Handles three distinct flows:
 *
 *   A. Stub flow   — query has stub=true (local dev only)
 *   B. HYP success — query has txId + responseMac (redirected from HYP successUrl)
 *   C. HYP error   — query has txId but missing/failed MAC (redirected from HYP errorUrl)
 *   D. Unknown     — no recognisable params (direct navigation / stale link)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️  Phase 2 — VERIFICATION ONLY. Nothing is written to the DB here.
 *
 *  Phase 3 TODO (implement after HYP integration is confirmed working):
 *    [ ] DB migration: add billingCustomerId, cardTokenEnc, cardExpEnc,
 *        cardMask, pendingPlanId columns to Subscription table.
 *    [ ] Store uniqueID in a pending checkout table at checkout time,
 *        then mark it used here to prevent replay attacks.
 *    [ ] On MAC verification success:
 *        - Set Subscription.status = ACTIVE
 *        - Set Subscription.plan   = plan from userData1 (via uniqueID lookup)
 *        - Set Subscription.billingInterval = interval from userData2
 *        - Set Subscription.billingProvider = "hyp"
 *        - Set Subscription.billingProviderId = txId
 *        - Encrypt and store cardToken + cardExp for recurring charges
 *        - Append SubscriptionEvent (type: "upgraded" or "trial_converted")
 *    [ ] Send confirmation email to user.
 *    [ ] Invalidate user JWT so new plan is reflected immediately.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata }       from "next";
import Link                    from "next/link";
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
      {/* Stub badge */}
      <div className="mx-6 mt-6 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-2.5 flex items-center gap-2.5">
        <span className="text-lg" aria-hidden="true">🧪</span>
        <p className="text-xs font-semibold text-amber-800">
          TEST MODE — תשלום סטאב בלבד. לא בוצע חיוב אמיתי.
        </p>
      </div>

      {/* Green header */}
      <div className="bg-emerald-500 mx-6 mt-4 rounded-xl px-5 py-4 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <p className="text-base font-bold">תשלום הבדיקה אושר</p>
            {planLabel && (
              <p className="text-sm text-emerald-100 mt-0.5">
                מסלול {planLabel}
              </p>
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

// ── Flow B: HYP verified success ─────────────────────────────────────────────

function HypVerifiedSuccess({
  txId,
  authNumber,
  cardMask,
}: {
  txId:        string;
  authNumber?: string;
  cardMask?:   string;
}) {
  return (
    <>
      <div className="bg-emerald-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">התשלום אושר!</h1>
            <p className="text-sm text-emerald-100 mt-0.5">
              האימות הצליח — הפרטים תקינים.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">✅</span>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5">
        {/* Transaction details — safe fields only */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-4 flex flex-col gap-2">
          <SummaryRow label="מזהה עסקה (txId)" value={txId} />
          {authNumber && <SummaryRow label="מספר אישור"    value={authNumber} />}
          {cardMask   && <SummaryRow label="כרטיס"         value={cardMask} />}
        </div>

        {/* Phase 2 notice — subscription not yet activated */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs font-semibold text-blue-800 mb-0.5">
            שלב 2 — אימות בלבד
          </p>
          <p className="text-xs text-blue-700 leading-relaxed">
            התשלום אומת בהצלחה אך המנוי טרם הופעל.
            הפעלת המנוי תתווסף בשלב 3 לאחר השלמת אינטגרציית HYP.
          </p>
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

// ── Flow C: HYP MAC verification failed ──────────────────────────────────────

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
            href="/pricing"
            className="w-full text-center text-sm font-bold py-3 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            חזור לדף המחירים
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

// ── Flow D: Unknown / direct navigation ──────────────────────────────────────

function UnknownFlow() {
  return (
    <>
      <div className="bg-gray-400 px-6 py-5 text-white">
        <h1 className="text-xl font-bold text-right">דף לאחר תשלום</h1>
      </div>
      <div className="px-6 py-6 flex flex-col gap-4">
        <p className="text-sm text-gray-600 text-center leading-relaxed">
          הגעת לדף זה ישירות. אם ניסית לשלם, חזור לדף המחירים ונסה שנית.
        </p>
        <Link
          href="/pricing"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          דף המחירים
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
    // HYP callback
    uniqueID?:   string;
    txId?:       string;
    cgUid?:      string;
    cardToken?:  string;
    cardExp?:    string;
    cardMask?:   string;
    personalId?: string;
    authNumber?: string;
    responseMac?: string;
  }>;
}) {
  const p = await searchParams;

  // ── Flow A: Stub ────────────────────────────────────────────────────────────
  if (p.stub === "true") {
    return (
      <PageShell>
        <StubSuccess plan={p.plan ?? ""} interval={p.interval ?? ""} />
      </PageShell>
    );
  }

  // ── Flow B/C: HYP callback ──────────────────────────────────────────────────
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
      responseMac: p.responseMac,
    };

    const password = process.env.HYP_PASSWORD?.trim() ?? "";

    // Log the verification attempt — never log cardToken/cardExp/password.
    console.log(
      `[billing/success] verifying HYP MAC` +
      ` txId=${p.txId}` +
      ` uniqueID=${p.uniqueID}` +
      ` hasCardMask=${Boolean(p.cardMask)}` +
      ` hasAuthNumber=${Boolean(p.authNumber)}`,
    );

    const verified = password
      ? verifyHypResponseMac(cbParams, password)
      : false;   // if password missing, treat as failed — never trust unsigned callback

    if (!password) {
      console.error(
        "[billing/success] HYP_PASSWORD is not set — cannot verify responseMac." +
        " Treating callback as unverified.",
      );
    }

    console.log(`[billing/success] MAC verification: ${verified ? "PASS" : "FAIL"}`);

    if (!verified) {
      return (
        <PageShell>
          <HypVerificationFailed txId={p.txId} />
        </PageShell>
      );
    }

    // ── Phase 3 TODO — subscription activation goes here ──────────────────
    // Verified: txId, authNumber, cardMask are safe to display.
    // cardToken + cardExp must NOT be displayed — save for recurring later.

    return (
      <PageShell>
        <HypVerifiedSuccess
          txId={p.txId}
          authNumber={p.authNumber}
          cardMask={p.cardMask}
        />
      </PageShell>
    );
  }

  // ── Flow D: Unknown ─────────────────────────────────────────────────────────
  return (
    <PageShell>
      <UnknownFlow />
    </PageShell>
  );
}
