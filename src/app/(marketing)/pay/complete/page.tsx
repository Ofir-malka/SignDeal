/**
 * /pay/complete — public payment-completion page.
 *
 * Both Rapyd and Stripe redirect the client here after the hosted checkout finishes.
 * No auth required — this is the client-facing confirmation screen.
 *
 * Query params:
 *   contractId  — our Contract DB id (used to look up real payment status)
 *   status      — "success" | "cancel"  (Rapyd redirect hint; DB is authoritative)
 *   session_id  — Stripe Checkout Session ID (present on Stripe success_url only).
 *                 Its presence signals a Stripe success redirect, equivalent to
 *                 status="success" for the isProcessing race-condition guard.
 *
 * Security: We verify the actual payment status from the DB rather than
 * trusting the URL param. Both params can be forged by navigating manually.
 * The DB is updated by the webhook (async), so a success redirect that arrives
 * before the webhook shows a "processing" state instead of a false failure.
 */

// Force dynamic so searchParams and DB reads are always fresh.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";

// ── Formatting ────────────────────────────────────────────────────────────────

/** Converts agorot → ILS and formats with Intl (e.g. "₪12,168"). */
function formatNIS(agorot: number): string {
  return new Intl.NumberFormat("he-IL", {
    style:                 "currency",
    currency:              "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(agorot / 100);
}

// ── Fee breakdown card ────────────────────────────────────────────────────────
//
// Shown below the status message on success / processing states.
// Only rendered when grossAmount is available and non-zero.
// The processorFee row is omitted when the fee is zero (BROKER mode or 0% config).

type AmountSnapshot = {
  amount:       number | null;
  processorFee: number | null;
  grossAmount:  number | null;
};

function FeeBreakdown({ amounts }: { amounts: AmountSnapshot | null }) {
  // Nothing to show if amounts weren't fetched or gross is missing / zero
  if (!amounts?.grossAmount) return null;

  const { amount, processorFee, grossAmount } = amounts;
  const hasProcessorFee = (processorFee ?? 0) > 0;

  return (
    <div className="w-full rounded-xl bg-gray-50 border border-gray-100 px-5 py-4 text-sm" dir="rtl">
      {/* Brokerage fee */}
      {amount != null && (
        <div className="flex justify-between items-center py-1.5">
          <span className="text-gray-500">עמלת תיווך</span>
          <span className="font-medium text-gray-800">{formatNIS(amount)}</span>
        </div>
      )}

      {/* Processing fee — shown only when non-zero */}
      {hasProcessorFee && (
        <div className="flex justify-between items-center py-1.5">
          <span className="text-gray-500">עמלת עיבוד</span>
          <span className="font-medium text-gray-800">{formatNIS(processorFee!)}</span>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-200 my-1.5" />

      {/* Total */}
      <div className="flex justify-between items-center py-1.5">
        <span className="font-semibold text-gray-900">סה״כ שולם</span>
        <span className="font-bold text-gray-900">{formatNIS(grossAmount)}</span>
      </div>
    </div>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <span className="font-semibold text-gray-900 text-[17px] tracking-tight">SignDeal</span>
    </div>
  );
}

type Props = {
  searchParams: Promise<{ contractId?: string; status?: string; session_id?: string }>;
};

export default async function PayCompletePage({ searchParams }: Props) {
  const { contractId, status, session_id } = await searchParams;

  // ── Verify actual payment status from DB ──────────────────────────────────
  // The URL param comes from Rapyd's redirect URL and can be forged.
  // We track two things:
  //   paymentFound   — a real Payment row exists for this contractId in the DB
  //   dbPaymentStatus — the status on that row (null when not found or DB error)
  //
  // Processing state requires BOTH a real DB record AND a "success" URL hint.
  // This prevents fake/invalid contractIds from showing "payment processing".
  let dbPaymentStatus: string | null = null;
  let paymentFound = false;
  let paymentAmounts: {
    amount:       number | null;
    processorFee: number | null;
    grossAmount:  number | null;
  } | null = null;

  if (contractId) {
    try {
      const payment = await prisma.payment.findFirst({
        where:  { contractId },
        select: {
          status:       true,
          amount:       true,
          processorFee: true,
          grossAmount:  true,
        },
      });
      if (payment) {
        paymentFound    = true;
        dbPaymentStatus = payment.status;
        paymentAmounts  = {
          amount:       payment.amount       ?? null,
          processorFee: payment.processorFee ?? null,
          grossAmount:  payment.grossAmount  ?? null,
        };
      }
    } catch {
      // DB lookup failed — fall through to neutral fallback
    }
  }

  // Decision matrix:
  //  DB = PAID                                       → success
  //  URL = "cancel" and DB ≠ PAID                    → cancel
  //  record EXISTS in DB, not PAID, URL = "success"  → processing (Rapyd webhook race)
  //  record EXISTS in DB, not PAID, session_id set   → processing (Stripe webhook race)
  //  no record in DB (fake/invalid contractId)       → neutral fallback
  //
  // session_id is present only on Stripe success_url redirects.  Its presence is
  // equivalent to status="success" as a "the client paid" hint — DB is authoritative.
  const isStripeReturn = !!session_id;
  const isSuccess      = dbPaymentStatus === "PAID";
  const isProcessing   = !isSuccess && paymentFound && (status === "success" || isStripeReturn);
  const isCancel       = status === "cancel" && !isSuccess;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 max-w-md w-full text-center space-y-5">
        <Logo />

        {isSuccess && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">התשלום התקבל בהצלחה</h1>
              <p className="text-sm text-gray-500 mt-1">
                תודה! אישור התשלום יישלח אליך בנפרד.
              </p>
            </div>
            <FeeBreakdown amounts={paymentAmounts} />
          </>
        )}

        {isProcessing && (
          <>
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto animate-pulse">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">התשלום בעיבוד</h1>
              <p className="text-sm text-gray-500 mt-1">
                הפרטים מאומתים — אישור ישלח אליך בהקדם.
              </p>
            </div>
            <FeeBreakdown amounts={paymentAmounts} />
          </>
        )}

        {isCancel && (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">התשלום בוטל</h1>
              <p className="text-sm text-gray-500 mt-1">
                התשלום לא הושלם. ניתן לנסות שוב דרך הקישור שנשלח אליך.
              </p>
            </div>
          </>
        )}

        {!isSuccess && !isProcessing && !isCancel && (
          <>
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">עמוד תשלום</h1>
              <p className="text-sm text-gray-500 mt-1">
                לפרטים נוספים, פנה למתווך שלך.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
