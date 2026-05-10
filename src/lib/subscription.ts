/**
 * subscription.ts
 *
 * Centralized subscription enforcement layer.
 *
 * ── Layer hierarchy ───────────────────────────────────────────────────────────
 *   plans.ts        — plan definitions, limits, pure logic (no DB, no Prisma)
 *   usage.ts        — DB queries: getActiveContractCount, ACTIVE_CONTRACT_STATUSES
 *   subscription.ts — orchestration: composes plans.ts + usage.ts; single entry
 *                     point for all "can this user do X?" decisions
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • TRIALING (active trial) is treated as PRO for limit purposes.
 * • CANCELED / EXPIRED / PAST_DUE block contract creation entirely regardless
 *   of active count.
 * • `limit` and `remaining` are TypeScript `number` values. `Infinity` is used
 *   internally for ENTERPRISE (unlimited). Callers that serialise to JSON must
 *   convert: `isFinite(v) ? v : null`.
 * • No duplicate DB calls — subscription is fetched once per check.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { canUserCreateContract } from "@/lib/subscription";
 *
 *   const check = await canUserCreateContract(userId);
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.reason }, { status: 403 });
 *   }
 */

import { prisma }            from "@/lib/prisma";
import {
  getEffectivePlan,
  getPlanLimits,
  STARTER_LIMIT,
  PRO_LIMIT,
  ENTERPRISE_LIMIT,
} from "@/lib/plans";
import type { SubscriptionForPlan, PlanType } from "@/lib/plans";
import { getActiveContractCount }             from "@/lib/usage";

// ── Reason codes (match what the frontend checks) ────────────────────────────
export type ContractBlockReason =
  | "SUBSCRIPTION_INACTIVE"   // EXPIRED / CANCELED / PAST_DUE / trial-expired
  | "CONTRACT_LIMIT_REACHED"; // active count ≥ plan limit

// ── Primary result type ───────────────────────────────────────────────────────
export interface ContractCreationCheck {
  /** Whether the user may create a new contract right now. */
  allowed: boolean;
  /** Defined only when allowed === false. */
  reason?: ContractBlockReason;
  /** Effective plan after trial-expiry logic. */
  plan:        PlanType;
  isTrialing:  boolean;
  isActive:    boolean;
  isExpired:   boolean;
  /** How many active (non-expired, non-canceled) contracts the user has. */
  activeCount: number;
  /**
   * Maximum allowed by their effective plan.
   * ENTERPRISE → Infinity (not JSON-safe; callers that serialise must convert).
   */
  limit:     number;
  /**
   * How many more contracts they can create.
   * ENTERPRISE → Infinity. Zero when at limit or subscription inactive.
   */
  remaining: number;
  /** ISO string or null — for display in the UI. */
  trialEndsAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts the nullable `maxActiveContracts` from PLAN_LIMITS to a TypeScript
 * number, using Infinity for "unlimited" (null sentinel from plans.ts).
 */
export function planToNumericLimit(plan: PlanType): number {
  if (plan === "STARTER")    return STARTER_LIMIT;
  if (plan === "PRO")        return PRO_LIMIT;
  return ENTERPRISE_LIMIT; // Infinity
}

/**
 * Returns true when the subscription allows new activity.
 *
 * Active = TRIALING with a non-expired trial, OR ACTIVE.
 * Everything else (PAST_DUE, CANCELED, EXPIRED, trial-expired) is inactive.
 */
export function isSubscriptionActive(subscription: SubscriptionForPlan): boolean {
  const { isExpired } = getEffectivePlan(subscription);
  if (isExpired) return false;
  return subscription.status === "TRIALING" || subscription.status === "ACTIVE";
}

// ── Null-subscription fallback ─────────────────────────────────────────────────
function inactiveResult(
  override: Partial<ContractCreationCheck> = {},
): ContractCreationCheck {
  return {
    allowed:     false,
    reason:      "SUBSCRIPTION_INACTIVE",
    plan:        "STARTER",
    isTrialing:  false,
    isActive:    false,
    isExpired:   true,
    activeCount: 0,
    limit:       STARTER_LIMIT,
    remaining:   0,
    trialEndsAt: null,
    ...override,
  };
}

// ── Primary API ───────────────────────────────────────────────────────────────

/**
 * Full subscription + usage check for a single user.
 *
 * Fetches the subscription from DB (one query), resolves the effective plan,
 * checks activity, and — only when active — queries the active contract count.
 *
 * @example
 *   const check = await canUserCreateContract(userId);
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.reason }, { status: 403 });
 *   }
 */
export async function canUserCreateContract(
  userId: string,
): Promise<ContractCreationCheck> {
  // ── 1. Load subscription ─────────────────────────────────────────────────
  const subscription = await prisma.subscription.findUnique({
    where:  { userId },
    select: { plan: true, status: true, trialEndsAt: true },
  });

  const trialEndsAt = subscription?.trialEndsAt?.toISOString() ?? null;

  // No subscription row at all → treat as worst-case inactive STARTER
  if (!subscription) {
    return inactiveResult({ trialEndsAt: null });
  }

  // ── 2. Resolve effective plan and activity ────────────────────────────────
  const { plan: effectivePlan, isTrialing, isExpired } = getEffectivePlan(subscription);
  const isActive = isSubscriptionActive(subscription);

  // ── 3. Inactive subscription → block immediately (no contract count needed)
  if (!isActive) {
    return inactiveResult({
      plan:        effectivePlan,
      isTrialing,
      isExpired,
      trialEndsAt,
    });
  }

  // ── 4. Active subscription → check contract limit ─────────────────────────
  const limit      = planToNumericLimit(effectivePlan);
  const activeCount = await getActiveContractCount(userId);
  const remaining  = limit === Infinity
    ? Infinity
    : Math.max(0, limit - activeCount);

  if (activeCount >= limit) {
    return {
      allowed:     false,
      reason:      "CONTRACT_LIMIT_REACHED",
      plan:        effectivePlan,
      isTrialing,
      isActive:    true,
      isExpired:   false,
      activeCount,
      limit,
      remaining:   0,
      trialEndsAt,
    };
  }

  // ── 5. Allowed ────────────────────────────────────────────────────────────
  return {
    allowed:    true,
    plan:       effectivePlan,
    isTrialing,
    isActive:   true,
    isExpired:  false,
    activeCount,
    limit,
    remaining,
    trialEndsAt,
  };
}

/**
 * Convenience wrapper — returns how many more contracts the user can create.
 * Returns Infinity for unlimited plans. Returns 0 for inactive subscriptions.
 */
export async function getRemainingContracts(userId: string): Promise<number> {
  const check = await canUserCreateContract(userId);
  return check.remaining;
}
