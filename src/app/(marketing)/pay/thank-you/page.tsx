/**
 * /pay/thank-you — public Grow CreatePaymentLink success-redirect (UX ONLY).
 *
 * Grow redirects the client here after they pay on the hosted grow.link page. This
 * page is purely cosmetic:
 *   • It NEVER marks Payment/Contract as PAID and NEVER writes anything.
 *   • It NEVER trusts the query param as proof of payment.
 *   • The /api/grow/webhook + getPaymentLinkInfo flow is the SOLE source of truth.
 *
 * It performs a READ-ONLY Payment.status lookup purely to pick a friendlier
 * message. When the DB is not yet PAID, the record is missing, or the lookup
 * fails, it shows a neutral "finalizing" state — never a failure. No amounts,
 * card details, transaction ids, broker secrets, or internal ids are exposed.
 */

// Always fresh: read searchParams + DB at request time, never prerender.
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";

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
  searchParams: Promise<{ contractId?: string }>;
};

export default async function PayThankYouPage({ searchParams }: Props) {
  const { contractId } = await searchParams;

  // Read-only status lookup — a UX hint only. The param is NEVER trusted as proof,
  // nothing is written, and any miss falls through to the neutral finalizing state.
  let isPaid = false;
  if (contractId) {
    try {
      const payment = await prisma.payment.findUnique({
        where: { contractId },
        select: { status: true },
      });
      isPaid = payment?.status === "PAID";
    } catch {
      // DB hiccup → show the neutral finalizing message (never a failure).
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 max-w-md w-full text-center space-y-5">
        <Logo />

        {isPaid ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">התשלום התקבל בהצלחה</h1>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                אנחנו מעדכנים את ההסכם והברוקר יקבל עדכון.
              </p>
            </div>
            <p className="text-sm text-gray-400">אפשר לסגור את החלון.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto animate-pulse">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">התשלום התקבל</h1>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                אנחנו מעדכנים את ההסכם והברוקר יקבל עדכון.
              </p>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              העדכון הסופי יכול לקחת כמה שניות. אפשר לסגור את החלון.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
