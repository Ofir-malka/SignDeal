/**
 * GET /api/subscription/usage
 *
 * Returns the authenticated user's current subscription state and contract
 * usage for the dashboard. Authenticated users only.
 *
 * Response shape (all numbers are JSON-safe):
 * {
 *   plan:        "STARTER" | "PRO" | "ENTERPRISE"
 *   isTrialing:  boolean
 *   isActive:    boolean
 *   isExpired:   boolean
 *   activeCount: number
 *   limit:       number | null   // null = unlimited (ENTERPRISE)
 *   remaining:   number | null   // null = unlimited (ENTERPRISE)
 *   trialEndsAt: string | null   // ISO-8601 date string
 *   allowed:     boolean
 *   reason?:     "SUBSCRIPTION_INACTIVE" | "CONTRACT_LIMIT_REACHED"
 * }
 */
import { NextResponse }          from "next/server";
import { requireUserId }         from "@/lib/require-user";
import { canUserCreateContract } from "@/lib/subscription";

// JSON cannot represent Infinity — convert to null so the client can display
// "unlimited" while keeping the data typed.
function finiteOrNull(n: number): number | null {
  return isFinite(n) ? n : null;
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const check = await canUserCreateContract(userId);

  return NextResponse.json({
    plan:        check.plan,
    isTrialing:  check.isTrialing,
    isActive:    check.isActive,
    isExpired:   check.isExpired,
    activeCount: check.activeCount,
    limit:       finiteOrNull(check.limit),
    remaining:   finiteOrNull(check.remaining),
    trialEndsAt: check.trialEndsAt,
    allowed:     check.allowed,
    ...(check.reason ? { reason: check.reason } : {}),
  });
}
