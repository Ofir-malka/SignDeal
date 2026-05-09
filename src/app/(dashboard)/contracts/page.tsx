import { DashboardShell } from "@/components/DashboardShell";
import { ContractsList } from "@/components/ContractsList";

export default function ContractsPage() {
  return (
    <DashboardShell>
      <ContractsList />
    </DashboardShell>
  );
}
