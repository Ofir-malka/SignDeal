/**
 * /pay/complete — public payment-completion page.
 *
 * Rapyd redirects the client here after the hosted checkout finishes.
 * No auth required — this is the client-facing confirmation screen.
 *
 * Query params:
 *   contractId — our Contract DB id (for display / future lookup)
 *   status     — "success" | "cancel"  (anything else → neutral fallback)
 */

// Force dynamic so searchParams are always fresh (not statically cached).
export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ contractId?: string; status?: string }>;
};

export default async function PayCompletePage({ searchParams }: Props) {
  const { status } = await searchParams;

  const isSuccess = status === "success";
  const isCancel  = status === "cancel";

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

        {!isSuccess && !isCancel && (
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
