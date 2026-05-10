/**
 * PATCH /api/admin/users/[id]/status
 *
 * Changes a user's subscription status. Admin-only.
 * Always re-checks DB role via requireAdmin() — never trusts JWT alone.
 * Writes a SubscriptionEvent for the audit trail.
 */
import { NextResponse }   from "next/server";
import { prisma }         from "@/lib/prisma";
import { requireAdmin }   from "@/lib/require-admin";

const VALID_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "EXPIRED",
] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

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
  const body = await request.json().catch(() => ({})) as { status?: string };
  const status = body.status as ValidStatus | undefined;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  // ── Find subscription ─────────────────────────────────────────────────────
  const subscription = await prisma.subscription.findUnique({
    where:  { userId },
    select: { id: true, plan: true, status: true },
  });

  if (!subscription) {
    return NextResponse.json({ error: "User or subscription not found" }, { status: 404 });
  }

  if (subscription.status === status) {
    return NextResponse.json({ message: "No change — status is already set to that value" });
  }

  // ── Update + audit ────────────────────────────────────────────────────────
  const updated = await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.update({
      where: { userId },
      data:  { status },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        event:          "status_changed",
        fromPlan:       subscription.plan,
        toPlan:         subscription.plan,
        fromStatus:     subscription.status,
        toStatus:       status,
        source:         "admin",
        actorId:        adminId,
        metadata:       JSON.stringify({ via: "admin_panel" }),
      },
    });

    return sub;
  });

  return NextResponse.json({ status: updated.status });
}
