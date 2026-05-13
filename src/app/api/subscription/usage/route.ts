/**
 * GET /api/subscription/usage
 *
 * Returns the authenticated user's current subscription state and monthly
 * document usage for the dashboard. Authenticated users only.
 *
 * Response shape (all numbers JSON-safe):
 * {
 *   // Plan identity
 *   plan:             "STANDARD" | "GROWTH" | "PRO" | "AGENCY"
 *   planLabel:        string          // Hebrew display label e.g. "סטנדרט"
 *   isTrialing:       boolean
 *   isActive:         boolean
 *   isExpired:        boolean
 *   trialEndsAt:      string | null   // ISO-8601
 *
 *   // Canonical monthly usage fields (Phase 2+)
 *   monthlyDocCount:  number
 *   monthlyDocLimit:  number | null   // null = AGENCY unlimited
 *   monthlyRemaining: number | null   // null = unlimited; 0 when blocked
 *
 *   // Backward-compat aliases — same values as canonical fields above.
 *   // Deprecated; will be removed in Phase 3 once all UI consumers are updated.
 *   activeCount:      number          // ≡ monthlyDocCount
 *   limit:            number | null   // ≡ monthlyDocLimit
 *   remaining:        number | null   // ≡ monthlyRemaining
 *
 *   // Gate result
 *   allowed:          boolean
 *   reason?:          "SUBSCRIPTION_INACTIVE" | "MONTHLY_LIMIT_REACHED"
 * }
 */
import { NextResponse }       from "next/server";
import { requireUserId }      from "@/lib/require-user";
import { canCreateContract }  from "@/lib/subscription";
import type { PlanType }      from "@/lib/plans";

// Hebrew display labels for each plan.
// Stale JWT tokens may carry deprecated values; map those gracefully.
const PLAN_LABELS: Record<string, string> = {
  STANDARD:   "סטנדרט",
  GROWTH:     "צמיחה",
  PRO:        "מקצועני",
  AGENCY:     "משרד",
  // deprecated — keep so old JWT tokens don't produce "undefined"
  STARTER:    "סטארטר",
  ENTERPRISE: "ארגוני",
};

function planLabel(plan: PlanType | string): string {
  return PLAN_LABELS[plan] ?? plan;
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const check = await canCreateContract(userId);

  return NextResponse.json({
    // Plan identity
    plan:             check.plan,
    planLabel:        planLabel(check.plan),
    isTrialing:       check.isTrialing,
    isActive:         check.isActive,
    isExpired:        check.isExpired,
    trialEndsAt:      check.trialEndsAt,

    // Canonical monthly usage fields
    monthlyDocCount:  check.monthlyDocCount,
    monthlyDocLimit:  check.monthlyDocLimit,
    monthlyRemaining: check.monthlyRemaining,

    // Backward-compat aliases (same values — deprecated, remove in Phase 3)
    activeCount:      check.activeCount,
    limit:            check.limit,
    remaining:        check.remaining,

    // Gate result
    allowed:          check.allowed,
    ...(check.reason ? { reason: check.reason } : {}),
  });
}
