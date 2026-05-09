import { DashboardShell } from "@/components/DashboardShell";
import { NewContractWizard } from "@/components/NewContractWizard";

export default function NewContractPage() {
  return (
    <DashboardShell>
      <NewContractWizard />
    </DashboardShell>
  );
}
