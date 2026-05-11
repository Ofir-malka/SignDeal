import { DashboardShell } from "@/components/DashboardShell";
import { QuickInterestedForm } from "@/components/QuickInterestedForm";

export const metadata = {
  title: "החתמת מתעניין | SignDeal",
};

export default function QuickInterestedPage() {
  return (
    <DashboardShell>
      <QuickInterestedForm />
    </DashboardShell>
  );
}
