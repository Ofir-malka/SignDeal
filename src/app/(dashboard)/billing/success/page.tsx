/**
 * /billing/success
 *
 * Post-payment landing page. Handles five distinct flows:
 *
 *   A. Stub        — query has stub=true (local dev only, no DB writes)
 *   B. Activated   — MAC verified + BillingCheckout found + subscription activated
 *   C. MAC failed  — responseMac missing or does not match
 *   D. Checkout error — checkout missing / expired / already resolved
 *   E. Unknown     — no recognisable params (direct navigation / stale link)
 *
 * Phase 3 Step 2: full activation flow.
 * On valid HYP callback:
 *   1. Parse + verify responseMac (using HYP_PASSP) — BEFORE any DB read.
 *   2. Find BillingCheckout by uniqueID (= our Order param).
 *   3. Guard: not found / expired / already SUCCEEDED / already FAILED.
 *   4. prisma.$transaction():
 *        - BillingCheckout  → SUCCEEDED, txId, HKId, authNumber, cardMask, resolvedAt
 *        - Subscription     → ACTIVE, plan, billingInterval, billingProvider,
 *                             billingSubscriptionId, currentPeriodStart, currentPeriodEnd
 *        - SubscriptionEvent → payment_succeeded / hyp_callback
 */

import type { Metadata } from "next";
import Link              from "next/link";
import { prisma }        from "@/lib/prisma";
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

// ── Flow B: Activation success ────────────────────────────────────────────────

function HypActivationSuccess({
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
  const periodEndStr  = periodEnd.toLocaleDateString("he-IL", {
    day: "numeric", month: "long", year: "numeric",
  });

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
        {/* Plan summary */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 flex flex-col gap-2">
          <SummaryRow label="מסלול"    value={planLabel} />
          <SummaryRow label="חיוב"     value={intervalLabel} />
          <SummaryRow label="חידוש הבא" value={periodEndStr} />
          {cardMask   && <SummaryRow label="כרטיס"      value={cardMask} />}
          {authNumber && <SummaryRow label="מספר אישור" value={authNumber} />}
          <SummaryRow label="מזהה עסקה" value={txId} />
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

// ── Flow B (idempotent): Already activated ────────────────────────────────────

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

// ── Flow C: MAC verification failed ──────────────────────────────────────────

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

// ── Flow D: Checkout lookup errors ────────────────────────────────────────────

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
      body:  "סשן זה כבר סומן כנכשל. אנא נסה להירשם מחדש.",
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
            href="/pricing"
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

// ── Flow E: Unknown / direct navigation ──────────────────────────────────────

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
    // HYP callback params
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

  // ── Flow A: Stub ────────────────────────────────────────────────────────────
  if (p.stub === "true") {
    return (
      <PageShell>
        <StubSuccess plan={p.plan ?? ""} interval={p.interval ?? ""} />
      </PageShell>
    );
  }

  // ── Flow B/C/D: HYP callback ────────────────────────────────────────────────
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
      ` hasAuthNumber=${Boolean(p.authNumber)}`,
    );

    // ── Step 1: verify MAC BEFORE any DB read ──────────────────────────────
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

    // ── Step 2: look up BillingCheckout ────────────────────────────────────
    const checkout = await prisma.billingCheckout.findUnique({
      where: { order: p.uniqueID },
    });

    console.log(
      `[billing/success] BillingCheckout lookup` +
      ` order=${p.uniqueID}` +
      ` found=${Boolean(checkout)}` +
      (checkout ? ` status=${checkout.status} expired=${checkout.expiresAt < new Date()}` : ""),
    );

    // Not found
    if (!checkout) {
      return (
        <PageShell>
          <CheckoutError reason="not_found" txId={p.txId} />
        </PageShell>
      );
    }

    // Expired
    if (checkout.expiresAt < new Date()) {
      return (
        <PageShell>
          <CheckoutError reason="expired" txId={p.txId} />
        </PageShell>
      );
    }

    // Already SUCCEEDED — idempotency: just show the already-activated screen
    if (checkout.status === "SUCCEEDED") {
      console.log(`[billing/success] checkout already SUCCEEDED — showing idempotent response`);
      return (
        <PageShell>
          <AlreadyActivated txId={p.txId} />
        </PageShell>
      );
    }

    // Already FAILED (previous MAC failure or manual mark)
    if (checkout.status === "FAILED") {
      return (
        <PageShell>
          <CheckoutError reason="failed" txId={p.txId} />
        </PageShell>
      );
    }

    // ── Step 3: compute next billing period ────────────────────────────────
    const now              = new Date();
    const currentPeriodEnd = new Date(now);
    if (checkout.interval === "YEARLY") {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    // ── Step 4: activate — all writes in a single transaction ──────────────
    try {
      await prisma.$transaction(async (tx) => {
        // 4a. Mark checkout SUCCEEDED
        await tx.billingCheckout.update({
          where: { order: p.uniqueID },
          data: {
            status:     "SUCCEEDED",
            txId:       p.txId,
            hkId:       p.HKId   ?? null,
            authNumber: p.authNumber ?? null,
            cardMask:   p.cardMask   ?? null,
            resolvedAt: now,
          },
        });

        // 4b. Activate subscription
        await tx.subscription.update({
          where: { userId: checkout.userId },
          data: {
            status:               "ACTIVE",
            plan:                 checkout.plan,
            billingInterval:      checkout.interval,
            billingProvider:      "hyp",
            billingSubscriptionId: p.HKId ?? null,
            currentPeriodStart:   now,
            currentPeriodEnd,
          },
        });

        // 4c. Append audit event — fetch subscriptionId inside the transaction
        const sub = await tx.subscription.findUniqueOrThrow({
          where:  { userId: checkout.userId },
          select: { id: true },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            event:          "payment_succeeded",
            toPlan:         checkout.plan,
            toStatus:       "ACTIVE",
            source:         "hyp_callback",
            actorId:        null,
            metadata:       JSON.stringify({
              txId:       p.txId,
              hkId:       p.HKId,
              authNumber: p.authNumber,
              order:      p.uniqueID,
            }),
          },
        });
      });

      console.log(
        `[billing/success] activation SUCCESS` +
        ` userId=${checkout.userId}` +
        ` plan=${checkout.plan}` +
        ` interval=${checkout.interval}` +
        ` txId=${p.txId}` +
        ` hkId=${p.HKId ?? "(none)"}` +
        ` periodEnd=${currentPeriodEnd.toISOString()}`,
      );
    } catch (err) {
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

    // ── Step 5: render success ─────────────────────────────────────────────
    return (
      <PageShell>
        <HypActivationSuccess
          txId={p.txId}
          plan={checkout.plan}
          interval={checkout.interval}
          authNumber={p.authNumber}
          cardMask={p.cardMask}
          periodEnd={currentPeriodEnd}
        />
      </PageShell>
    );
  }

  // ── Flow E: Unknown / direct navigation ────────────────────────────────────
  return (
    <PageShell>
      <UnknownFlow />
    </PageShell>
  );
}
