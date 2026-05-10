/**
 * PATCH /api/admin/users/[id]/role
 *
 * Promotes or demotes a user's role (BROKER ↔ ADMIN). Admin-only.
 * Always re-checks DB role via requireAdmin() — never trusts JWT alone.
 *
 * Note: role changes are reflected at the next sign-in (JWT is not
 * immediately invalidated). The admin layout's DB re-check means a demoted
 * admin loses access to /admin pages on their next page navigation.
 */
import { NextResponse }   from "next/server";
import { prisma }         from "@/lib/prisma";
import { requireAdmin }   from "@/lib/require-admin";

const VALID_ROLES = ["BROKER", "ADMIN"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;
  const { adminId } = adminResult;

  const { id: userId } = await params;

  // ── Validate body ─────────────────────────────────────────────────────────
  const body = await request.json().catch(() => ({})) as { role?: string };
  const role = body.role as ValidRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  // ── Self-demotion guard ───────────────────────────────────────────────────
  // Prevent admins from accidentally locking themselves out.
  if (userId === adminId && role === "BROKER") {
    return NextResponse.json(
      { error: "You cannot demote yourself. Ask another admin to do this." },
      { status: 400 },
    );
  }

  // ── Find user ─────────────────────────────────────────────────────────────
  const target = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === role) {
    return NextResponse.json({ message: "No change — role is already set to that value" });
  }

  // ── Update ────────────────────────────────────────────────────────────────
  const updated = await prisma.user.update({
    where:  { id: userId },
    data:   { role },
    select: { id: true, role: true },
  });

  return NextResponse.json({ role: updated.role });
}
