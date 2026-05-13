/**
 * subscription.ts
 *
 * Centralized subscription enforcement layer.
 *
 * ── Layer hierarchy ───────────────────────────────────────────────────────────
 *   plans.ts        — plan definitions, monthly doc limits, pure logic (no DB)
 *   usage.ts        — DB queries: getMonthlyDocumentUsage
 *   subscription.ts — orchestration: composes plans.ts + usage.ts; single entry
 *                     point for all "can this user do X?" decisions
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • Monthly document limit (not simultaneous active contracts) is the enforced
 *   dimension. "Document" = any Contract row, any status.
 * • TRIALING (active trial) → TRIAL_MONTHLY_DOC_LIMIT (10) regardless of plan.
 * • CANCELED / EXPIRED / PAST_DUE / trial-expired → block immediately; user can
 *   still read existing data (proxy.ts does not enforce at the page level).
 * • Backward-compat aliases (activeCount, limit, remaining) are populated with
 *   the same values as the new canonical fields (monthlyDocCount, monthlyDocLimit,
 *   monthlyRemaining) so all existing callers continue to work without changes.
 *   Remove aliases in Phase 2 once usage/route.ts and UI components are updated.
 * • No duplicate DB calls — subscription is fetched once per check.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { canCreateContract } from "@/lib/subscription";
 *
 *   const check = await canCreateContract(userId);
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.reason }, { status: 403 });
 *   }
 */

import { NextResponse }              from "next/server";
import { prisma }                    from "@/lib/prisma";
import {
  getEffectivePlan,
  getMonthlyDocLimit,
  PLAN_MONTHLY_DOC_LIMITS,
  TRIAL_MONTHLY_DOC_LIMIT,
} from "@/lib/plans";
import type { SubscriptionForPlan, PlanType } from "@/lib/plans";
import { getMonthlyDocumentUsage }   from "@/lib/usage";

// ── Reason codes ──────────────────────────────────────────────────────────────
// MONTHLY_LIMIT_REACHED replaces the old CONTRACT_LIMIT_REACHED.
// No frontend component currently switches on the reason string value, so
// this rename is safe. The comment in contracts/route.ts references the old
// name — update it in Phase 2.
export type ContractBlockReason =
  | "SUBSCRIPTION_INACTIVE"    // expired trial / EXPIRED / CANCELED / PAST_DUE
  | "MONTHLY_LIMIT_REACHED";   // monthlyDocCount >= plan monthly limit

// ── Result type ───────────────────────────────────────────────────────────────
export interface ContractCreationCheck {
  allowed:    boolean;
  reason?:    ContractBlockReason;
  plan:       PlanType;
  isTrialing: boolean;
  isActive:   boolean;
  isExpired:  boolean;

  // ── Canonical fields (Phase 1+) ───────────────────────────────────────────
  monthlyDocCount:  number;
  /** null = AGENCY unlimited. */
  monthlyDocLimit:  number | null;
  /** null = unlimited (AGENCY). 0 when at/over limit or inactive. */
  monthlyRemaining: number | null;

  // ── Backward-compat aliases — same values, deprecated, removed in Phase 2 ──
  // usage/route.ts, UsageCard, and UpgradeBanner still read these field names.
  /** @deprecated Phase 2: use monthlyDocCount */
  activeCount: number;
  /** @deprecated Phase 2: use monthlyDocLimit */
  limit:       number | null;
  /** @deprecated Phase 2: use monthlyRemaining */
  remaining:   number | null;

  trialEndsAt: string | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Builds a fully-populated inactive result.
 * Both canonical fields and backward-compat aliases are set.
 */
function inactiveResult(
  plan:        PlanType,
  isTrialing:  boolean,
  trialEndsAt: string | null,
): ContractCreationCheck {
  // Show the plan's normal limit in the result so the UI can tell the user
  // "you need to subscribe to get 30 docs/month on STANDARD" etc.
  const monthlyDocLimit = isTrialing
    ? TRIAL_MONTHLY_DOC_LIMIT
    : PLAN_MONTHLY_DOC_LIMITS[plan];

  return {
    allowed:          false,
    reason:           "SUBSCRIPTION_INACTIVE",
    plan,
    isTrialing,
    isActive:         false,
    isExpired:        true,
    monthlyDocCount:  0,
    monthlyDocLimit,
    monthlyRemaining: 0,
    // backward-compat aliases
    activeCount:      0,
    limit:            monthlyDocLimit,
    remaining:        0,
    trialEndsAt,
  };
}

/** null → null (unlimited); finite → Math.max(0, limit - used). */
function computeRemaining(limit: number | null, used: number): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - used);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches the user's subscription row.
 * Returns null if no subscription exists (edge case — all registered users
 * should have one created at registration).
 */
export async function getUserSubscription(userId: string) {
  return prisma.subscription.findUnique({
    where:  { userId },
    select: {
      id:                 true,
      plan:               true,
      status:             true,
      trialEndsAt:        true,
      billingInterval:    true,
      currentPeriodStart: true,
      currentPeriodEnd:   true,
      canceledAt:         true,
    },
  });
}

/**
 * Full subscription + monthly usage check for a single user.
 *
 * Fetches the subscription from DB (one query), resolves the effective plan,
 * checks activity, and — only when active — queries the monthly document count.
 *
 * Returns a ContractCreationCheck with both canonical (Phase 1) and
 * backward-compat (Phase 2 to remove) field names populated identically.
 *
 * @example
 *   const check = await canCreateContract(userId);
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.reason }, { status: 403 });
 *   }
 */
export async function canCreateContract(
  userId: string,
): Promise<ContractCreationCheck> {
  // ── 1. Load subscription ──────────────────────────────────────────────────
  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: { plan: true, status: true, trialEndsAt: true },
  });

  // No subscription row → block (all registered users should have one)
  if (!sub) {
    return inactiveResult("STANDARD", false, null);
  }

  const trialEndsAt = sub.trialEndsAt?.toISOString() ?? null;

  // ── 2. Resolve effective plan and activity ────────────────────────────────
  const { plan, isTrialing, isExpired } = getEffectivePlan(
    sub as SubscriptionForPlan,
  );

  // Active = TRIALING (non-expired) or ACTIVE.
  // PAST_DUE, CANCELED, EXPIRED, and trial-expired are all inactive.
  const isActive = !isExpired && (sub.status === "TRIALING" || sub.status === "ACTIVE");

  // ── 3. Inactive → block immediately (no doc count needed) ─────────────────
  if (!isActive) {
    return inactiveResult(plan, isTrialing, trialEndsAt);
  }

  // ── 4. Active → apply monthly document limit ──────────────────────────────
  const monthlyDocLimit  = getMonthlyDocLimit(plan, isTrialing);
  const monthlyDocCount  = await getMonthlyDocumentUsage(userId);
  const monthlyRemaining = computeRemaining(monthlyDocLimit, monthlyDocCount);

  if (monthlyDocLimit !== null && monthlyDocCount >= monthlyDocLimit) {
    return {
      allowed:          false,
      reason:           "MONTHLY_LIMIT_REACHED",
      plan,
      isTrialing,
      isActive:         true,
      isExpired:        false,
      monthlyDocCount,
      monthlyDocLimit,
      monthlyRemaining: 0,
      // backward-compat aliases
      activeCount:      monthlyDocCount,
      limit:            monthlyDocLimit,
      remaining:        0,
      trialEndsAt,
    };
  }

  // ── 5. Allowed ────────────────────────────────────────────────────────────
  return {
    allowed:          true,
    plan,
    isTrialing,
    isActive:         true,
    isExpired:        false,
    monthlyDocCount,
    monthlyDocLimit,
    monthlyRemaining,
    // backward-compat aliases
    activeCount:      monthlyDocCount,
    limit:            monthlyDocLimit,
    remaining:        monthlyRemaining,
    trialEndsAt,
  };
}

/**
 * Convenience wrapper: returns a 403 NextResponse if the user's subscription
 * is inactive, null if the caller may proceed.
 *
 * Use at the top of API route handlers that gate paid actions (payment requests,
 * SMS sends, etc.) before the main action logic.
 *
 * @example
 *   const blocked = await requireActiveSubscription(userId);
 *   if (blocked) return blocked;
 */
export async function requireActiveSubscription(
  userId: string,
): Promise<NextResponse | null> {
  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: { plan: true, status: true, trialEndsAt: true },
  });

  if (!sub) {
    return NextResponse.json(
      { error: "SUBSCRIPTION_INACTIVE", message: "No active subscription found." },
      { status: 403 },
    );
  }

  const { isExpired } = getEffectivePlan(sub as SubscriptionForPlan);
  const isActive =
    !isExpired && (sub.status === "TRIALING" || sub.status === "ACTIVE");

  if (!isActive) {
    return NextResponse.json(
      { error: "SUBSCRIPTION_INACTIVE", message: "Subscription is not active." },
      { status: 403 },
    );
  }

  return null;
}

/**
 * @deprecated Renamed to canCreateContract(). Alias kept for one release cycle
 * so callers (contracts/route.ts) do not need to change in Phase 1.
 * Remove in Phase 2.
 */
export const canUserCreateContract = canCreateContract;
