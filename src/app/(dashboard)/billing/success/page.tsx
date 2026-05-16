/**
 * /billing/success — HYP browser-redirect + What=VERIFY activation flow.
 *
 * ── Protocol (per official HYP docs) ─────────────────────────────────────────
 * 1. HYP browser-redirects to our GoodURL (/billing/success) with signed params:
 *      Id, Order, Sign, CCode, HKId, L4digit, Tmonth, Tyear, Amount, ACode
 * 2. This server component calls action=APISign&What=VERIFY + credentials + params.
 * 3. HYP responds: CCode=0 (valid) or CCode=902 (invalid).
 * 4. On CCode=0: atomically activate subscription (PENDING→SUCCEEDED, INCOMPLETE→TRIALING).
 * 5. Read updated subscription from DB and render.
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 * Browser params are UNTRUSTED — we never activate on params alone.
 * Activation only happens after What=VERIFY returns CCode=0 from HYP.
 * The atomic `updateMany WHERE status=PENDING` guard prevents double-activation.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Page refresh = same params → same VERIFY call → `updateMany WHERE PENDING`
 * catches the repeat → subscription already TRIALING → success rendered from DB.
 *
 * ── Portal GoodURL requirement ────────────────────────────────────────────────
 * GoodURL in the HYP portal MUST match SuccessUrl exactly:
 *   https://www.signdeal.co.il/billing/success
 * If they differ, HYP strips all query params on redirect — VERIFY will fail.
 *
 * ── Note on hyp-notify ────────────────────────────────────────────────────────
 * /api/billing/hyp-notify is UNUSED. URLserver does not exist in HYP's protocol.
 * HYP never calls it. See that file for details.
 */

import type { Metadata } from "next";
import Link              from "next/link";
import { redirect }      from "next/navigation";
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { TRIAL_DAYS }    from "@/lib/plans";

export const metadata: Metadata = {
  title:  "תוצאת תשלום | SignDeal",
  robots: { index: false, follow: false },
};

// ── HYP endpoint ──────────────────────────────────────────────────────────────

const HYP_PAY_URL = "https://pay.hyp.co.il/p/";

// ── Valid CCode values (official HYP docs) ────────────────────────────────────
//
//  CCode=0   Approved — real money was charged.
//            Valid for ALL subscription paths (trial activation + paid charges).
//
//  CCode=700 "Approve without charge" / "אישור ללא חיוב"
//            J5 flow: reserves the customer's credit line WITHOUT depositing funds.
//            HYP sends this when J5=True + OnlyOnApprove=True and the card passes
//            authorization.  The recurring agreement (HKId) IS created.
//            Valid ONLY for INCOMPLETE → TRIALING (card-first trial activation).
//            MUST NOT be treated as a successful charge for paid subscriptions.
//
//  Any other CCode = declined / error — redirect to payment declined UI.
//
// Source: HYP APISign docs, "Hypay Error Codes" table + J5 section.

/** CCodes that may arrive at the SuccessUrl and are not hard failures. */
const VALID_REDIRECT_CCODES = new Set(["0", "700"]);

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

// ── Flow D: Payment declined by HYP ──────────────────────────────────────────

function PaymentDeclined({ cCode }: { cCode: string }) {
  return (
    <>
      <div className="bg-red-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">התשלום לא אושר</h1>
            <p className="text-sm text-red-100 mt-0.5">
              הכרטיס לא אושר על ידי HYP {cCode ? `(קוד: ${cCode})` : ""}.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">❌</span>
        </div>
      </div>
      <div className="px-6 py-6 flex flex-col gap-4">
        <p className="text-sm text-gray-600 text-center leading-relaxed">
          ייתכן שהכרטיס נדחה או פג תוקפו. אנא נסה שנית עם כרטיס אחר.
        </p>
        <Link
          href="/onboarding/billing"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          נסה שנית
        </Link>
        <a
          href="mailto:support@signdeal.co.il"
          className="w-full text-center text-sm py-2.5 rounded-xl
                     border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          פנה לתמיכה
        </a>
      </div>
    </>
  );
}

// ── Flow E: VERIFY call failed ────────────────────────────────────────────────

function VerifyFailed() {
  return (
    <>
      <div className="bg-amber-500 px-6 py-5 text-white">
        <div className="flex items-center gap-3 justify-end">
          <div>
            <h1 className="text-xl font-bold">אימות התשלום נכשל</h1>
            <p className="text-sm text-amber-100 mt-0.5">
              לא הצלחנו לאמת את התשלום אל מול HYP.
            </p>
          </div>
          <span className="text-4xl" aria-hidden="true">⚠️</span>
        </div>
      </div>
      <div className="px-6 py-6 flex flex-col gap-4">
        <p className="text-sm text-gray-600 text-center leading-relaxed">
          ייתכן שהתשלום אושר אך האימות נכשל. אנא פנה לתמיכה עם פרטי ההזמנה.
        </p>
        <a
          href="mailto:support@signdeal.co.il"
          className="w-full text-center text-sm font-bold py-3 rounded-xl
                     bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          פנה לתמיכה
        </a>
        <Link
          href="/dashboard"
          className="text-xs text-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          עבור ללוח הבקרה →
        </Link>
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

// ── VERIFY: server-side transaction verification ──────────────────────────────
// Calls action=APISign&What=VERIFY + credentials + all redirect params.
// HYP verifies the Sign cryptographic signature and responds:
//   CCode=0   → authentic (Sign is valid). Expected for both CCode=0 and CCode=700 transactions.
//   CCode=700 → J5 authorization confirmed authentic. May appear for J5 flows.
//   CCode=902 → invalid / tampered.
//   Other     → HYP-side error.
// NEVER activate the subscription without a valid VERIFY response.

async function callHypVerify(params: {
  id:      string;
  order:   string;
  sign:    string;
  amount:  string;
  l4digit?: string;
  tmonth?:  string;
  tyear?:   string;
}): Promise<{ cCode: string; raw: string }> {
  const masof  = process.env.HYP_MASOF?.trim()   ?? "";
  const passp  = process.env.HYP_PASSP?.trim()   ?? "";
  const apiKey = process.env.HYP_API_KEY?.trim() ?? "";

  const qp = new URLSearchParams({
    action:  "APISign",
    What:    "VERIFY",
    KEY:     apiKey,
    Masof:   masof,
    PassP:   passp,
    Id:      params.id,
    Order:   params.order,
    Sign:    params.sign,
    Amount:  params.amount || "0",
    Coin:    "1",
    UTF8:    "True",
    UTF8out: "True",
  });

  if (params.l4digit) qp.set("L4digit", params.l4digit);
  if (params.tmonth)  qp.set("Tmonth",  params.tmonth);
  if (params.tyear)   qp.set("Tyear",   params.tyear);

  let raw = "";
  try {
    const resp = await fetch(`${HYP_PAY_URL}?${qp.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    raw = await resp.text().catch(() => "");
  } catch (err) {
    console.error(
      "[billing/success] VERIFY network error:",
      err instanceof Error ? err.message : err,
    );
    return { cCode: "999", raw: "" };
  }

  // HYP response is query-string format: "CCode=0&Id=…&Amount=…"
  let cCode = "999";
  try {
    cCode = new URLSearchParams(raw.trim()).get("CCode") ?? "999";
  } catch {
    const m = raw.match(/CCode=(\d+)/);
    cCode   = m?.[1] ?? "999";
  }

  return { cCode, raw };
}

// ── Activation: atomic PENDING→SUCCEEDED + INCOMPLETE→TRIALING ───────────────

async function activateCheckout(params: {
  order:    string;
  userId:   string;
  hypId:    string;
  /** Original CCode from the HYP redirect. Used to enforce path-specific rules. */
  cCode:    string;
  hkId?:    string;
  l4digit?: string;
  tmonth?:  string;
  tyear?:   string;
  aCode?:   string;
}): Promise<void> {
  const { order, userId, hypId, cCode, hkId, l4digit, tmonth, tyear, aCode } = params;

  // Fetch checkout and subscription in parallel.
  const [checkout, subscription] = await Promise.all([
    prisma.billingCheckout.findUnique({ where: { order } }),
    prisma.subscription.findUnique({
      where:  { userId },
      select: { id: true, status: true, plan: true },
    }),
  ]);

  if (!checkout) throw new Error("CHECKOUT_NOT_FOUND");
  if (checkout.userId !== userId) throw new Error("CHECKOUT_USER_MISMATCH");

  // Already activated — idempotent return.
  if (checkout.status === "SUCCEEDED") return;

  if (checkout.status !== "PENDING") {
    console.warn(
      `[billing/success] activateCheckout unexpected checkout status` +
      ` status=${checkout.status} order="${order}"`,
    );
    throw new Error(`CHECKOUT_STATUS_${checkout.status}`);
  }

  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");

  const isTrialActivation = subscription.status === "INCOMPLETE";

  // CCode=700 (J5 auth-only / no charge) is valid ONLY for trial activation.
  // If this fires on a paid-subscription path, something is wrong — reject it.
  // A paid recurring charge MUST be CCode=0 (real money collected).
  if (cCode === "700" && !isTrialActivation) {
    console.error(
      `[billing/success] CCode=700 on non-trial path` +
      ` subscriptionStatus=${subscription.status} order="${order}" userId=${userId}` +
      ` — J5 auth-only cannot activate a paid subscription. Rejecting.`,
    );
    throw new Error("INVALID_CCODE_700_ON_PAID_PATH");
  }

  const now = new Date();

  // Parse card fields from official HYP redirect params.
  // L4digit  → last 4 digits (strip non-digits as safety measure)
  // Tmonth   → expiry month as integer
  // Tyear    → expiry year as integer (HYP sends 4-digit year per docs)
  const cardLast4    = l4digit ? (l4digit.replace(/\D/g, "").slice(-4) || null) : null;
  const cardExpMonth = tmonth  ? (parseInt(tmonth, 10) || null)                 : null;
  const cardExpYear  = tyear   ? (parseInt(tyear,  10) || null)                 : null;

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

  console.log(
    `[billing/success] ACTIVATING` +
    ` path=${isTrialActivation ? "INCOMPLETE→TRIALING" : "→ACTIVE"}` +
    ` cCode=${cCode}` +
    ` userId=${userId}` +
    ` order="${order}"` +
    ` plan=${checkout.plan}` +
    ` interval=${checkout.interval}` +
    ` hasHkId=${Boolean(hkId)}` +
    ` cardLast4=${cardLast4 ?? "(none)"}`,
  );

  await prisma.$transaction(async (tx) => {
    // Atomic guard: updateMany WHERE status=PENDING prevents double-activation
    // on concurrent page loads (e.g. user opens two tabs simultaneously).
    const checkoutUpdate = await tx.billingCheckout.updateMany({
      where: { order, status: "PENDING" },
      data:  {
        status:     "SUCCEEDED",
        txId:       hypId   || null,   // HYP's transaction Id
        hkId:       hkId    || null,   // HYP recurring agreement HKId
        cardMask:   l4digit || null,   // L4digit stored here for display
        authNumber: aCode   || null,   // bank authorisation number ACode
        resolvedAt: now,
      },
    });

    if (checkoutUpdate.count === 0) {
      // Another concurrent request won the race — throw to trigger idempotent path.
      throw new Error("ALREADY_PROCESSED");
    }

    if (isTrialActivation) {
      // INCOMPLETE → TRIALING: card entered for the first time, trial begins now.
      await tx.subscription.update({
        where: { userId },
        data:  {
          status:                "TRIALING",
          plan:                  checkout.plan,
          billingInterval:       checkout.interval,
          billingProvider:       "hyp",
          billingSubscriptionId: hkId || null,  // HKId = recurring agreement cursor
          cardToken:             hkId || null,  // same — used for Phase 3 charges
          cardLast4,
          cardExpMonth,
          cardExpYear,
          tokenCreatedAt:        now,
          trialEndsAt,
          nextBillingAt:         trialEndsAt,
        },
      });
    } else {
      // TRIALING / ACTIVE → ACTIVE: paid billing cycle begins.
      await tx.subscription.update({
        where: { userId },
        data:  {
          status:                "ACTIVE",
          plan:                  checkout.plan,
          billingInterval:       checkout.interval,
          billingProvider:       "hyp",
          billingSubscriptionId: hkId || null,
          cardToken:             hkId || null,
          cardLast4,
          cardExpMonth,
          cardExpYear,
          tokenCreatedAt:        now,
          firstPaymentAt:        now,
          nextBillingAt:         currentPeriodEnd,
          currentPeriodStart:    now,
          currentPeriodEnd,
        },
      });
    }

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        event:          isTrialActivation ? "trial_started" : "payment_succeeded",
        fromPlan:       subscription.plan,
        toPlan:         checkout.plan,
        fromStatus:     subscription.status,
        toStatus:       isTrialActivation ? "TRIALING" : "ACTIVE",
        source:         "hyp_verify",
        actorId:        null,
        metadata:       JSON.stringify({
          hypId,
          cCode,          // "0" = paid charge; "700" = J5 auth-only (trial)
          hkId:       hkId  || null,
          authNumber: aCode || null,
          order,
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
    `[billing/success] ACTIVATION_SUCCESS` +
    ` path=${isTrialActivation ? "INCOMPLETE→TRIALING" : "→ACTIVE"}` +
    ` userId=${userId}` +
    ` order="${order}"`,
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;

  // Safe string extractor — handles both `"value"` and `["value"]` shapes.
  const sp = (key: string): string => {
    const v = p[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v))      return v[0] ?? "";
    return "";
  };

  // ── Flow A: Stub (local dev / staging test) ───────────────────────────────
  if (sp("stub") === "true") {
    return (
      <PageShell>
        <StubSuccess plan={sp("plan")} interval={sp("interval")} />
      </PageShell>
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/billing/success");
  }
  const userId = session.user.id;

  // ── Read official HYP redirect params ────────────────────────────────────
  // These are the exact param names from the official HYP APISign docs.
  // Do NOT use: txId, uniqueID, responseMac, cardMask, cardExp — these are
  // not real HYP params and will be absent in production redirects.
  const order   = sp("Order")   || sp("order");  // our original Order value
  const hypId   = sp("Id");                       // HYP transaction identifier
  const sign    = sp("Sign");                     // HYP cryptographic signature
  const cCode   = sp("CCode");                    // "0" = paid; "700" = J5 auth-only (trial)
  const hkId    = sp("HKId")    || undefined;     // recurring agreement ID
  const l4digit = sp("L4digit") || undefined;     // last 4 card digits
  const tmonth  = sp("Tmonth")  || undefined;     // expiry month (MM)
  const tyear   = sp("Tyear")   || undefined;     // expiry year (YYYY)
  const amount  = sp("Amount")  || "0";           // transaction amount in shekels
  const aCode   = sp("ACode")   || undefined;     // bank authorisation number

  console.log(
    `[billing/success] params` +
    ` userId=${userId.slice(0, 8)}…` +
    ` order="${order}"` +
    ` CCode="${cCode}"` +
    ` hasId=${Boolean(hypId)}` +
    ` hasSign=${Boolean(sign)}` +
    ` hasHKId=${Boolean(hkId)}` +
    ` L4digit=${l4digit ?? "(none)"}` +
    ` Tmonth=${tmonth ?? "(none)"}` +
    ` Tyear=${tyear ?? "(none)"}`,
  );

  // ── Direct navigation / missing params ───────────────────────────────────
  // No `Order` means either: (a) the user navigated here directly, or (b) HYP
  // stripped params because portal GoodURL ≠ SuccessUrl.
  //
  // Fix for (b): set GoodURL in HYP portal to:
  //   https://www.signdeal.co.il/billing/success
  //
  // For case (a), check if the subscription is already active (from a previous
  // successful visit) and render success if so.
  if (!order) {
    const sub = await prisma.subscription.findUnique({
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

    if (sub?.status === "TRIALING" && sub.trialEndsAt) {
      return (
        <PageShell>
          <TrialActivationSuccess
            plan={sub.plan}
            interval={sub.billingInterval}
            trialEndsAt={sub.trialEndsAt}
            cardLast4={sub.cardLast4}
            txId={null}
            authNumber={null}
          />
        </PageShell>
      );
    }

    if (sub?.status === "ACTIVE" && sub.currentPeriodEnd) {
      return (
        <PageShell>
          <UpgradeActivationSuccess
            plan={sub.plan}
            interval={sub.billingInterval}
            currentPeriodEnd={sub.currentPeriodEnd}
            cardLast4={sub.cardLast4}
            txId={null}
            authNumber={null}
          />
        </PageShell>
      );
    }

    console.warn(
      `[billing/success] no HYP params + no active subscription` +
      ` — direct navigation or portal GoodURL mismatch? userId=${userId}`,
    );
    return <PageShell><UnknownFlow /></PageShell>;
  }

  // ── CCode validity check ──────────────────────────────────────────────────
  // CCode=0   → paid transaction.          Valid for all subscription paths.
  // CCode=700 → J5 auth-only (no charge). Valid for INCOMPLETE → TRIALING only.
  // Anything else → HYP declined the card; show declined UI.
  if (!VALID_REDIRECT_CCODES.has(cCode)) {
    console.log(
      `[billing/success] payment declined` +
      ` CCode="${cCode}" order="${order}" userId=${userId}`,
    );
    return <PageShell><PaymentDeclined cCode={cCode} /></PageShell>;
  }

  // ── Verify + Activate (idempotent) ────────────────────────────────────────
  // Check if already activated before calling VERIFY (page refresh optimisation).
  const existingCheckout = await prisma.billingCheckout.findUnique({
    where:  { order },
    select: { status: true, userId: true },
  });

  // Security: reject if order belongs to a different user.
  if (existingCheckout && existingCheckout.userId !== userId) {
    console.error(
      `[billing/success] order/user mismatch` +
      ` order="${order}" requestUserId=${userId}` +
      ` checkoutUserId=${existingCheckout.userId}`,
    );
    return <PageShell><UnknownFlow /></PageShell>;
  }

  let verifyError: string | null = null;

  if (existingCheckout?.status !== "SUCCEEDED") {
    // Step 1: cryptographic VERIFY — the only trusted confirmation.
    const { cCode: verifyCCode, raw: verifyRaw } = await callHypVerify({
      id:      hypId,
      order,
      sign,
      amount,
      l4digit,
      tmonth,
      tyear,
    });

    console.log(
      `[billing/success] VERIFY response` +
      ` CCode="${verifyCCode}"` +
      ` order="${order}"` +
      ` rawLength=${verifyRaw.length}`,
    );

    // VERIFY response validity:
    //   CCode=0   → Sign is authentic. Always valid.
    //   CCode=700 → J5 auth-only confirmed authentic. Accepted when redirect was also 700.
    //   Any other → tampered / HYP error. Abort.
    const verifyOk =
      verifyCCode === "0" ||
      (verifyCCode === "700" && cCode === "700");

    if (!verifyOk) {
      verifyError = `VERIFY_CCODE_${verifyCCode}`;
      console.error(
        `[billing/success] VERIFY failed` +
        ` verifyCCode="${verifyCCode}" redirectCCode="${cCode}"` +
        ` order="${order}" userId=${userId}` +
        ` raw=${verifyRaw.slice(0, 200)}`,
      );
    } else {
      // Step 2: activate subscription now that VERIFY confirmed authenticity.
      // cCode is forwarded so activateCheckout can enforce path-specific rules
      // (CCode=700 is only valid for the INCOMPLETE → TRIALING trial path).
      try {
        await activateCheckout({ order, userId, hypId, cCode, hkId, l4digit, tmonth, tyear, aCode });
      } catch (err) {
        if (err instanceof Error && err.message === "ALREADY_PROCESSED") {
          // Concurrent request won the race — harmless; DB is already correct.
          console.log(
            `[billing/success] ALREADY_PROCESSED (race condition) order="${order}"`,
          );
        } else {
          verifyError = err instanceof Error ? err.message : String(err);
          console.error(`[billing/success] activation error: ${verifyError}`);
        }
      }
    }
  }

  // Show error UI if VERIFY or activation failed.
  if (verifyError) {
    return <PageShell><VerifyFailed /></PageShell>;
  }

  // ── Read updated subscription for display ─────────────────────────────────
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
    console.error(
      `[billing/success] subscription not found after activation — userId=${userId}`,
    );
    return <PageShell><UnknownFlow /></PageShell>;
  }

  const { status, plan, billingInterval } = subscription;

  console.log(
    `[billing/success] rendering` +
    ` userId=${userId.slice(0, 8)}…` +
    ` status=${status} plan=${plan} interval=${billingInterval}`,
  );

  // Flow B: TRIALING — first-time trial activation.
  if (status === "TRIALING" && subscription.trialEndsAt) {
    return (
      <PageShell>
        <TrialActivationSuccess
          plan={plan}
          interval={billingInterval}
          trialEndsAt={subscription.trialEndsAt}
          cardLast4={subscription.cardLast4}
          txId={hypId  || null}
          authNumber={aCode || null}
        />
      </PageShell>
    );
  }

  // Flow C: ACTIVE — upgrade or re-activation.
  if (status === "ACTIVE" && subscription.currentPeriodEnd) {
    return (
      <PageShell>
        <UpgradeActivationSuccess
          plan={plan}
          interval={billingInterval}
          currentPeriodEnd={subscription.currentPeriodEnd}
          cardLast4={subscription.cardLast4}
          txId={hypId  || null}
          authNumber={aCode || null}
        />
      </PageShell>
    );
  }

  // Fallback: unexpected status after activation — should not normally reach here.
  return <PageShell><UnknownFlow /></PageShell>;
}
