export const dynamic = "force-dynamic";

import { DashboardShell } from "@/components/DashboardShell";
import { ContractDetailLoader } from "@/components/ContractDetailLoader";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <DashboardShell>
      <ContractDetailLoader id={id} />
    </DashboardShell>
  );
}