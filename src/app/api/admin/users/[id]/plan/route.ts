/**
 * PATCH /api/admin/users/[id]/plan
 *
 * Changes a user's subscription plan. Admin-only.
 * Always re-checks DB role via requireAdmin() — never trusts JWT alone.
 * Writes a SubscriptionEvent for the audit trail.
 */
import { NextResponse }   from "next/server";
import { prisma }         from "@/lib/prisma";
import { requireAdmin }   from "@/lib/require-admin";

// Active plan values only — STARTER and ENTERPRISE are deprecated.
// Admin UI will show these four options; old values are rejected.
const VALID_PLANS = ["STANDARD", "GROWTH", "PRO", "AGENCY"] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

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
  const body = await request.json().catch(() => ({})) as { plan?: string };
  const plan = body.plan as ValidPlan | undefined;

  if (!plan || !VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
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

  if (subscription.plan === plan) {
    return NextResponse.json({ message: "No change — plan is already set to that value" });
  }

  // ── Update + audit ────────────────────────────────────────────────────────
  const updated = await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.update({
      where: { userId },
      data:  { plan },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        event:          "plan_changed",
        fromPlan:       subscription.plan,
        toPlan:         plan,
        fromStatus:     subscription.status,
        toStatus:       subscription.status,
        source:         "admin",
        actorId:        adminId,
        metadata:       JSON.stringify({ via: "admin_panel" }),
      },
    });

    return sub;
  });

  return NextResponse.json({ plan: updated.plan });
}
