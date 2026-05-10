/**
 * Admin layout — server-side DB role gate.
 *
 * Two layers of protection for every /admin/* page:
 *   1. proxy.ts (middleware): fast JWT role check → redirects non-admins before
 *      the page even renders.
 *   2. HERE: re-queries the DB on every request — if a user was demoted mid-
 *      session their JWT still shows ADMIN, but this gate catches it and
 *      redirects them before they see any admin UI.
 *
 * No Prisma call is skipped — this is intentional.
 */
import type { Metadata } from "next";
import Link              from "next/link";
import { redirect }      from "next/navigation";
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";

export const metadata: Metadata = {
  title: { default: "Admin | SignDeal", template: "%s | Admin | SignDeal" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── DB role check — never trust the JWT alone ─────────────────────────────
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true, fullName: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") redirect("/dashboard");

  // ── Admin shell ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50" dir="ltr">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-sm tracking-wide uppercase">
            SignDeal <span className="text-red-600">Admin</span>
          </span>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/admin/users"
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Users
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{dbUser.fullName}</span>
          <Link
            href="/dashboard"
            className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            ← Back to app
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
