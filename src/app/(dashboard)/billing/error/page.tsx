/**
 * /billing/error
 *
 * HYP redirects the user here when a payment attempt fails (card declined,
 * 3DS failure, bank error, etc.). This is distinct from /pricing (cancel).
 *
 * HYP appends query params: uniqueID, txId, errorCode, responseMac, etc.
 * We do NOT verify the MAC here — this is a user-facing informational page,
 * not a webhook. The actual subscription state is only updated by the
 * server-side callback handler (future work).
 *
 * The page gives the user clear options:
 *   1. Try again → /pricing
 *   2. Contact support
 *   3. Go to dashboard
 */

import type { Metadata }  from "next";
import Link               from "next/link";

export const metadata: Metadata = {
  title:  "תשלום נכשל | SignDeal",
  robots: { index: false, follow: false },
};

export default async function BillingErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ txId?: string; errorCode?: string; uniqueID?: string }>;
}) {
  const params    = await searchParams;
  const errorCode = params.errorCode ?? "";
  const txId      = params.txId      ?? "";

  // Friendly message for common HYP error codes.
  // https://hyp.co.il/developer — error code reference
  const friendlyMessage =
    errorCode === "033" ? "הכרטיס נחסם על ידי הבנק. אנא פנה לבנק שלך." :
    errorCode === "051" ? "אין מסגרת אשראי מספקת. בדוק את פרטי הכרטיס ונסה שנית." :
    errorCode === "054" ? "תוקף הכרטיס פג. אנא השתמש בכרטיס אחר." :
    errorCode === "057" ? "עסקה לא מאושרת לכרטיס זה. פנה לבנק שלך." :
    "התשלום לא הושלם. ייתכן שפרטי הכרטיס שגויים, או שהבנק לא אישר את העסקה.";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16"
    >
      {/* ── Error card ── */}
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Header */}
        <div className="bg-red-600 px-6 py-5 text-white text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-200 mb-1">
            SignDeal — תשלום
          </p>
          <h1 className="text-xl font-bold flex items-center gap-2 justify-end">
            <span>התשלום לא הצליח</span>
            <span aria-hidden="true">❌</span>
          </h1>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">

          {/* Error message */}
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-4">
            <p className="text-sm text-red-800 leading-relaxed">
              {friendlyMessage}
            </p>
            {errorCode && (
              <p className="mt-2 text-xs text-red-400 font-mono">
                קוד שגיאה: {errorCode}
                {txId && ` · עסקה: ${txId}`}
              </p>
            )}
          </div>

          {/* What to do */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">מה לעשות עכשיו?</p>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>בדוק שפרטי הכרטיס נכנסו נכון</li>
              <li>וודא שיש מסגרת אשראי פנויה</li>
              <li>נסה כרטיס אחר</li>
              <li>פנה לבנק שלך לאישור העסקה</li>
            </ul>
          </div>

          {/* Try again button */}
          <Link
            href="/pricing"
            className="w-full text-center text-sm font-bold py-3.5 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700
                       transition-colors active:scale-[0.98]"
          >
            נסה שנית ←
          </Link>

          {/* Secondary actions */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <Link
              href="/contracts"
              className="hover:text-gray-600 transition-colors"
            >
              חזור ללוח הבקרה
            </Link>
            <a
              href="mailto:support@signdeal.co.il"
              className="hover:text-gray-600 transition-colors"
            >
              פנה לתמיכה
            </a>
          </div>

        </div>
      </div>

      {/* Bottom note */}
      <p className="mt-6 text-xs text-gray-400 text-center max-w-sm leading-relaxed">
        לא חויבת. ניסיון התשלום לא הושלם — לא הועברה כל עלות לכרטיס שלך.
      </p>
    </div>
  );
}
