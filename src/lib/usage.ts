/**
 * usage.ts
 *
 * Runtime usage helpers for plan limit enforcement.
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • Single Prisma query per check — no N+1, no caching complexity.
 * • "Active" contracts = any status that is NOT EXPIRED or CANCELED.
 *   This matches the definition in PlanLimits.maxActiveContracts.
 * • canCreateContract() does NOT throw — it returns a typed result so callers
 *   can decide whether to return 403, show an upgrade prompt, or both.
 * • No plan logic lives here — import getPlanLimits / getEffectivePlan from
 *   plans.ts for that.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { canCreateContract } from "@/lib/usage";
 *
 *   const check = await canCreateContract(userId, subscription);
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.reason }, { status: 403 });
 *   }
 */

import { prisma } from "@/lib/prisma";
import type { SignatureStatus } from "@/generated/prisma";
import { getPlanLimits, getEffectivePlan } from "@/lib/plans";
import type { SubscriptionForPlan } from "@/lib/plans";

// ── Active statuses ────────────────────────────────────────────────────────────
// Any contract that has not been explicitly closed (EXPIRED or CANCELED) counts
// toward the user's active-contract quota.
export const ACTIVE_CONTRACT_STATUSES = [
  "DRAFT",
  "SENT",
  "OPENED",
  "SIGNED",
  "PAYMENT_PENDING",
  "PAID",
] as const;

export type ActiveContractStatus = (typeof ACTIVE_CONTRACT_STATUSES)[number];

// ── Result types ───────────────────────────────────────────────────────────────
export interface ContractUsageResult {
  /** How many active contracts the user currently has. */
  activeCount: number;
  /** The maximum allowed by their effective plan. `null` = unlimited. */
  limit: number | null;
  /** Whether the user can create another contract right now. */
  allowed: boolean;
  /**
   * Human-readable reason when `allowed` is false.
   * Always defined when allowed === false; undefined when allowed === true.
   */
  reason?: string;
}

// ── Queries ────────────────────────────────────────────────────────────────────

/**
 * Returns the number of active (non-expired, non-canceled) contracts for a user.
 *
 * @example
 *   const count = await getActiveContractCount(userId);
 */
export async function getActiveContractCount(userId: string): Promise<number> {
  return prisma.contract.count({
    where: {
      userId,
      status: { in: ACTIVE_CONTRACT_STATUSES as unknown as SignatureStatus[] },
    },
  });
}

/**
 * Checks whether a user is allowed to create a new contract given their
 * current subscription and active-contract count.
 *
 * Resolves the effective plan (handles expired trials transparently), then
 * compares activeCount against maxActiveContracts.
 *
 * @param userId        — The authenticated broker's user ID.
 * @param subscription  — The user's subscription row (plan, status, trialEndsAt).
 *
 * @example
 *   const check = await canCreateContract(userId, subscription);
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.reason }, { status: 403 });
 *   }
 */
export async function canCreateContract(
  userId: string,
  subscription: SubscriptionForPlan,
): Promise<ContractUsageResult> {
  const { plan } = getEffectivePlan(subscription);
  const limits   = getPlanLimits(plan);
  const limit    = limits.maxActiveContracts;

  // Unlimited plan — no DB query needed.
  if (limit === null) {
    return { activeCount: 0, limit: null, allowed: true };
  }

  const activeCount = await getActiveContractCount(userId);

  if (activeCount >= limit) {
    return {
      activeCount,
      limit,
      allowed: false,
      reason:  `הגעת למגבלת ${limit} החוזים הפעילים בתכנית שלך. שדרג לפרו לחוזים ללא הגבלה.`,
    };
  }

  return { activeCount, limit, allowed: true };
}
