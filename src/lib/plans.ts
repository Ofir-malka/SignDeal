/**
 * plans.ts
 *
 * Single source of truth for:
 *   • Plan feature limits (what each tier can do)
 *   • Effective plan evaluation (handles trial expiry transparently)
 *   • Trial duration constant
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • Limits are defined in code, NOT the database.
 *   Changing a limit = deploy, not migration. Correct for beta.
 * • No Prisma import — pure data/logic. Safe to import from any context
 *   (server components, API routes, future client components).
 * • String literal union types match the Prisma enums exactly so callers
 *   can use values from either source without casting.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { getPlanLimits, getEffectivePlan, TRIAL_DAYS } from "@/lib/plans";
 *
 *   // Enforce a feature gate in an API route:
 *   const { plan } = getEffectivePlan(subscription);
 *   const limits   = getPlanLimits(plan);
 *   if (!limits.smsReminders) return 403;
 */

// ── Shared type aliases (string literal unions = Prisma enum values) ───────────
export type PlanType           = "STARTER" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

// ── Trial ──────────────────────────────────────────────────────────────────────
/** Number of days in the free Pro trial, applied at registration. */
export const TRIAL_DAYS = 14;

// ── Feature limits per plan ────────────────────────────────────────────────────
export interface PlanLimits {
  /**
   * Maximum number of simultaneously active contracts.
   * `null` = unlimited.
   * "Active" = any status that is not CANCELED or EXPIRED.
   */
  maxActiveContracts: number | null;

  /** SMS signing/payment reminders sent automatically. */
  smsReminders: boolean;

  /** WhatsApp reminders. */
  whatsappReminders: boolean;

  /** Payment request links sent from a contract. */
  paymentRequests: boolean;

  /** Full dashboard analytics and client history. */
  advancedDashboard: boolean;

  /** Elevated support queue. */
  prioritySupport: boolean;
}

export const PLAN_LIMITS = {
  STARTER: {
    maxActiveContracts: 3,
    smsReminders:       false,
    whatsappReminders:  false,
    paymentRequests:    false,
    advancedDashboard:  false,
    prioritySupport:    false,
  },
  PRO: {
    maxActiveContracts: null,  // unlimited
    smsReminders:       true,
    whatsappReminders:  true,
    paymentRequests:    true,
    advancedDashboard:  true,
    prioritySupport:    true,
  },
  ENTERPRISE: {
    maxActiveContracts: null,
    smsReminders:       true,
    whatsappReminders:  true,
    paymentRequests:    true,
    advancedDashboard:  true,
    prioritySupport:    true,
    // multiUser / apiAccess: added in a future phase
  },
} as const satisfies Record<PlanType, PlanLimits>;

/**
 * Returns the feature limits for a given plan type.
 *
 * @example
 *   const limits = getPlanLimits("PRO");
 *   if (!limits.paymentRequests) throw new Error("Upgrade required");
 */
export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan];
}

// ── Effective plan evaluation ──────────────────────────────────────────────────

/** Minimal subscription shape needed for plan evaluation — no Prisma import. */
export interface SubscriptionForPlan {
  plan:        PlanType;
  status:      SubscriptionStatus;
  trialEndsAt: Date | null;
}

export interface EffectivePlanResult {
  /** The plan that should be enforced right now. */
  plan: PlanType;
  /** True when the user is within an active trial period. */
  isTrialing: boolean;
  /**
   * True when a trial or subscription has expired with no active payment.
   * Callers should degrade to STARTER limits and prompt for upgrade.
   */
  isExpired: boolean;
}

/**
 * Derives the plan that should be enforced for a user right now.
 *
 * Handles the case where a TRIALING subscription has passed its trialEndsAt
 * date: the effective plan degrades to STARTER even though the DB still says
 * PRO/TRIALING (the DB row is updated lazily by the API route that detects this).
 *
 * This function is pure and synchronous — safe to call in any context.
 *
 * @example
 *   const { plan, isTrialing, isExpired } = getEffectivePlan(subscription);
 *   const limits = getPlanLimits(plan);
 */
export function getEffectivePlan(subscription: SubscriptionForPlan): EffectivePlanResult {
  const now = new Date();

  // Trial is expired when the subscription is still TRIALING in the DB but
  // the trialEndsAt date has passed.
  const trialExpired =
    subscription.status === "TRIALING" &&
    subscription.trialEndsAt !== null &&
    subscription.trialEndsAt < now;

  // A subscription is expired if it was explicitly set to EXPIRED, or if the
  // trial period has silently passed without a payment method being attached.
  const isExpired =
    subscription.status === "EXPIRED" || trialExpired;

  // When expired, degrade to the free tier regardless of what the DB plan says.
  const effectivePlan: PlanType = isExpired ? "STARTER" : subscription.plan;

  const isTrialing =
    subscription.status === "TRIALING" && !trialExpired;

  return { plan: effectivePlan, isTrialing, isExpired };
}
