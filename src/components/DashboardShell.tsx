import { Sidebar } from "@/components/Sidebar";
import { AuthGuard } from "@/components/AuthGuard";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
  <AuthGuard>
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar – renders on the right in RTL */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
        </div>
  </AuthGuard>
);
}
