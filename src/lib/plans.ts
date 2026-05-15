/**
 * plans.ts
 *
 * Single source of truth for:
 *   • Plan types and billing intervals (string literal unions = Prisma enum values)
 *   • Monthly document limits per plan
 *   • Trial document limit
 *   • Pricing constants (used by pricing UI — NOT used for enforcement)
 *   • Effective plan evaluation (handles trial expiry transparently)
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • Limits are defined in code, NOT the database.
 *   Changing a limit = deploy, not migration. Correct for beta.
 * • The limit dimension is now monthly document creation (not simultaneous
 *   active contracts). "Document" = any Contract row regardless of status.
 * • No Prisma import — pure data/logic. Safe to import from any context
 *   (server components, API routes, edge middleware).
 * • STARTER and ENTERPRISE are kept as deprecated string values so that any
 *   JWT tokens written before the migration (which may contain "STARTER" or
 *   "ENTERPRISE") do not crash callers. They are NOT valid plan choices for
 *   new subscriptions and are not present in PLAN_MONTHLY_DOC_LIMITS.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { getEffectivePlan, getMonthlyDocLimit, TRIAL_MONTHLY_DOC_LIMIT } from "@/lib/plans";
 *
 *   const { plan, isTrialing, isExpired } = getEffectivePlan(subscription);
 *   const limit = getMonthlyDocLimit(plan, isTrialing);
 *   if (limit !== null && monthlyCount >= limit) return 403;
 */

// ── Active plan types (new model, Phase 1+) ───────────────────────────────────
// These are the only values written to new Subscription rows.
export type PlanType =
  | "STANDARD"   // 30 docs/month — ₪39/mo or ₪29/mo annually
  | "GROWTH"     // 60 docs/month — ₪49/mo or ₪39/mo annually
  | "PRO"        // 100 docs/month — ₪110/mo or ₪99/mo annually
  | "AGENCY";    // Custom — null doc limit, contact sales

export type BillingInterval = "MONTHLY" | "YEARLY";

export type SubscriptionStatus =
  | "INCOMPLETE"  // Phase 2A: account created, card not yet provided — blocks all actions
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED";

// ── Trial ─────────────────────────────────────────────────────────────────────
/** Number of days in the free trial, applied at registration. */
export const TRIAL_DAYS = 14;

/**
 * Max documents a TRIALING user may create per calendar month.
 * Consistent with paid-plan semantics (monthly cap, not a total-trial cap).
 * Revisit if we want a total-trial-lifetime cap instead.
 */
export const TRIAL_MONTHLY_DOC_LIMIT = 10;

// ── Monthly document limits per plan ─────────────────────────────────────────
// null = no enforced limit (AGENCY — custom contract).
// After trial expiry the subscription is INACTIVE — no limit applies because
// creation is blocked entirely (not degraded to a lower limit).
export const PLAN_MONTHLY_DOC_LIMITS: Record<PlanType, number | null> = {
  STANDARD: 30,
  GROWTH:   60,
  PRO:      100,
  AGENCY:   null,
};

// ── Pricing (ILS) ─────────────────────────────────────────────────────────────
// Not used for enforcement. Source of truth for pricing UI and admin displays.
// AGENCY = contact sales, no published price.
export const PLAN_PRICES = {
  STANDARD: { monthly: 39,  yearly: 29  },
  GROWTH:   { monthly: 49,  yearly: 39  },
  PRO:      { monthly: 110, yearly: 99  },
  AGENCY:   null,
} as const;

// ── Minimal subscription shape for plan evaluation (no Prisma import) ─────────
export interface SubscriptionForPlan {
  plan:        PlanType;
  status:      SubscriptionStatus;
  trialEndsAt: Date | null;
}

// ── Effective plan result ─────────────────────────────────────────────────────
export interface EffectivePlanResult {
  /** The plan stored in DB (returned as-is — no degradation for expired state). */
  plan:       PlanType;
  /** True when the user is within an active, non-expired trial. */
  isTrialing: boolean;
  /**
   * True when the subscription is inactive:
   *   • Trial period has expired (TRIALING + trialEndsAt < now)
   *   • status is EXPIRED or CANCELED
   *   • status is PAST_DUE (grace period — block creation, allow read)
   * Callers must block paid actions and show an upgrade/reactivate prompt.
   */
  isExpired:  boolean;
}

/**
 * Derives the subscription state that should be enforced right now.
 * Pure and synchronous — safe to call from any context.
 *
 * Note: unlike the previous version, isExpired does NOT change the `plan`
 * field. The stored plan is always returned so callers can tell the user
 * "you're on STANDARD — subscribe to re-activate" rather than a generic
 * STARTER fallback message.
 */
export function getEffectivePlan(sub: SubscriptionForPlan): EffectivePlanResult {
  const now = new Date();

  const trialExpired =
    sub.status === "TRIALING" &&
    sub.trialEndsAt !== null &&
    sub.trialEndsAt < now;

  const isExpired =
    sub.status === "INCOMPLETE" ||  // Phase 2A: no card yet — block all paid actions
    sub.status === "EXPIRED"    ||
    sub.status === "CANCELED"   ||  // canceled: block actions, allow read
    sub.status === "PAST_DUE"   ||  // grace period: block creation, allow read
    trialExpired;

  const isTrialing = sub.status === "TRIALING" && !trialExpired;

  return { plan: sub.plan, isTrialing, isExpired };
}

/**
 * Returns the effective monthly document limit for a user.
 *
 *   • Trialing users: always TRIAL_MONTHLY_DOC_LIMIT (10), regardless of plan.
 *   • Active paid users: PLAN_MONTHLY_DOC_LIMITS[plan] (null = unlimited).
 *   • Inactive/expired: callers should block before reaching this; returns 0.
 *
 * @param plan       — the effective plan (from getEffectivePlan().plan)
 * @param isTrialing — from getEffectivePlan().isTrialing
 */
export function getMonthlyDocLimit(
  plan:       PlanType,
  isTrialing: boolean,
): number | null {
  if (isTrialing) return TRIAL_MONTHLY_DOC_LIMIT;
  return PLAN_MONTHLY_DOC_LIMITS[plan];
}
