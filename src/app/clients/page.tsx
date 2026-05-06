import { DashboardShell } from "@/components/DashboardShell";
import { ClientsList } from "@/components/ClientsList";

export default function ClientsPage() {
  return (
    <DashboardShell>
      <ClientsList />
    </DashboardShell>
  );
}
