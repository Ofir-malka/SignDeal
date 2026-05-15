import { redirect }         from "next/navigation";
import { auth }              from "@/lib/auth";
import { DashboardShell }    from "@/components/DashboardShell";
import { NewContractForm }   from "@/components/NewContractForm";
import { canCreateContract, getPlanLabel } from "@/lib/subscription";

/**
 * /contracts/new — unified one-page contract creation form.
 *
 * Replaces the 5-step NewContractWizard as the default creation UX.
 * The wizard component is preserved in code for reference / rollback.
 *
 * All existing href="/contracts/new" buttons throughout the app now land here.
 *
 * Scroll note: DashboardShell uses `h-screen overflow-hidden` on the outer
 * wrapper. Every dashboard page must supply its own `flex-1 overflow-y-auto`
 * <main> to get a scrollable content area. This page follows that pattern.
 *
 * Subscription gate: canCreateContract() is called server-side and its result
 * is passed to NewContractForm so the form can show a contextual banner and
 * disable the submit button without a round-trip to the usage API.
 */
export const metadata = {
  title: "חוזה חדש | SignDeal",
};

export default async function NewContractPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const check = await canCreateContract(session.user.id);
  const subscription = {
    allowed:          check.allowed,
    reason:           check.reason,
    plan:             check.plan,
    planLabel:        getPlanLabel(check.plan),
    isTrialing:       check.isTrialing,
    isActive:         check.isActive,
    isExpired:        check.isExpired,
    trialEndsAt:      check.trialEndsAt,
    monthlyDocCount:  check.monthlyDocCount,
    monthlyDocLimit:  check.monthlyDocLimit,
    monthlyRemaining: check.monthlyRemaining,
  };

  return (
    <DashboardShell>
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto">
          <NewContractForm subscription={subscription} />
        </div>
      </main>
    </DashboardShell>
  );
}
