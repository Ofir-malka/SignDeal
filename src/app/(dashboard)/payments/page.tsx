import { redirect }           from "next/navigation";
import { auth }                from "@/lib/auth";
import { DashboardShell }      from "@/components/DashboardShell";
import { UpgradeBanner }       from "@/components/UpgradeBanner";
import { canCreateContract, getPlanLabel, checkNeedsBanner } from "@/lib/subscription";
import type { UsageData }      from "@/components/UsageCard";

export default async function PaymentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const check = await canCreateContract(session.user.id);

  const bannerData: UsageData | null = checkNeedsBanner(check)
    ? {
        plan:             check.plan,
        planLabel:        getPlanLabel(check.plan),
        isTrialing:       check.isTrialing,
        isActive:         check.isActive,
        isExpired:        check.isExpired,
        trialEndsAt:      check.trialEndsAt,
        monthlyDocCount:  check.monthlyDocCount,
        monthlyDocLimit:  check.monthlyDocLimit,
        monthlyRemaining: check.monthlyRemaining,
        activeCount:      check.monthlyDocCount,
        limit:            check.monthlyDocLimit,
        remaining:        check.monthlyRemaining,
        allowed:          check.allowed,
        reason:           check.reason,
      }
    : null;

  return (
    <DashboardShell>
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">תשלומים</h1>
          <p className="text-sm text-gray-500 mt-0.5">מעקב אחר תשלומים ועמלות</p>
        </div>
        <button className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          רשום תשלום
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        {bannerData && (
          <div className="mb-4">
            <UpgradeBanner data={bannerData} />
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-gray-900">אין תשלומים עדיין</p>
            <p className="text-sm text-gray-500 mt-1">תשלומים יופיעו כאן לאחר אישור עסקאות</p>
          </div>
          <button className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm">
            רשום תשלום
          </button>
        </div>
      </main>
    </DashboardShell>
  );
}
