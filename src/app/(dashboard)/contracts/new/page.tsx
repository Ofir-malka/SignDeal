import { DashboardShell }  from "@/components/DashboardShell";
import { NewContractForm } from "@/components/NewContractForm";

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
 */
export const metadata = {
  title: "חוזה חדש | SignDeal",
};

export default function NewContractPage() {
  return (
    <DashboardShell>
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto">
          <NewContractForm />
        </div>
      </main>
    </DashboardShell>
  );
}
