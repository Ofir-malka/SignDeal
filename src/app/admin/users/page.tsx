import type { Metadata }   from "next";
import Link                 from "next/link";
import { prisma }           from "@/lib/prisma";
import { UsersTable }       from "./UsersTable";
import type { AdminUserRow } from "./UsersTable";

export const metadata: Metadata = { title: "Users" };

// Force dynamic rendering so searchParams are always fresh and router.refresh()
// in the client component picks up DB changes immediately.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const rawPage  = Number(params.page ?? "1");
  const [total, rawUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      skip:    (Math.max(1, rawPage) - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        fullName:  true,
        email:     true,
        role:      true,
        createdAt: true,
        subscription: {
          select: {
            plan:        true,
            status:      true,
            trialEndsAt: true,
          },
        },
      },
    }),
  ]);

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, rawPage), totalPages);

  // Serialise Date objects before passing to the client component.
  // Prisma enum values are string-literal-compatible with our AdminUserRow types.
  const users: AdminUserRow[] = rawUsers.map((u) => ({
    id:        u.id,
    fullName:  u.fullName,
    email:     u.email as "BROKER" | "ADMIN",
    role:      u.role  as "BROKER" | "ADMIN",
    createdAt: u.createdAt.toISOString(),
    subscription: u.subscription
      ? {
          plan:        u.subscription.plan   as "STANDARD" | "GROWTH" | "PRO" | "AGENCY",
          status:      u.subscription.status as "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED",
          trialEndsAt: u.subscription.trialEndsAt?.toISOString() ?? null,
        }
      : null,
  }));

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
      </div>

      {/* Table */}
      <UsersTable users={users} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/admin/users?page=${currentPage - 1}`}
                className="px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                ← Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/admin/users?page=${currentPage + 1}`}
                className="px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
