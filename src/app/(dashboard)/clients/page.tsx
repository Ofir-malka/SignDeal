import { redirect }           from "next/navigation";
import { auth }                from "@/lib/auth";
import { DashboardShell }      from "@/components/DashboardShell";
import { ClientsList }         from "@/components/ClientsList";
import { UpgradeBanner }       from "@/components/UpgradeBanner";
import { canCreateContract, getPlanLabel, checkNeedsBanner } from "@/lib/subscription";
import type { UsageData }      from "@/components/UsageCard";

export default async function ClientsPage() {
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
      <>
        {bannerData && (
          <div className="shrink-0 px-4 sm:px-8 pt-4">
            <UpgradeBanner data={bannerData} />
          </div>
        )}
        <ClientsList />
      </>
    </DashboardShell>
  );
}
