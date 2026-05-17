/**
 * @/lib/billing/access — billing escalation state helper.
 *
 * Pure function — no DB calls. Accepts any object that carries
 * `status` and `billingFailures` (a subset of the Subscription row).
 *
 * ── Failure levels ─────────────────────────────────────────────────────────────
 *   0 — no failures               — healthy; no banners
 *   1 — 1st charge failure        — soft warning; all features accessible
 *   2 — 2nd charge failure        — strong warning; all features accessible
 *   3 — 3+ failures → PAST_DUE   — premium features blocked; update-payment CTA
 *
 * ── Contract: MAX_BILLING_FAILURES = 3 ────────────────────────────────────────
 * Mirrors the constant in recurring.ts. After 3 failures the subscription
 * status is set to PAST_DUE by the cron. Once PAST_DUE, canUsePremiumFeatures
 * is false — the same condition that blocks contract creation in canCreateContract.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { getBillingAccessState } from "@/lib/billing/access";
 *
 *   const state = getBillingAccessState(sub);
 *   if (!state.canUsePremiumFeatures) {
 *     return NextResponse.json({ error: "BILLING_PAST_DUE" }, { status: 402 });
 *   }
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface BillingAccessState {
  /** false only when status === "PAST_DUE" (max failures reached). */
  canUsePremiumFeatures: boolean;
  /** true when status === "PAST_DUE". */
  isPastDue:             boolean;
  /**
   * true when billingFailures >= 1.
   * The dashboard should show a "please update payment" warning banner.
   */
  isWarning:             boolean;
  /**
   * 0 = healthy; 1 = first failure; 2 = second failure; 3 = PAST_DUE.
   * Clamped at 3; never exceeds MAX_BILLING_FAILURES.
   */
  failureLevel:          0 | 1 | 2 | 3;
}

/** Minimum subscription shape required by getBillingAccessState. */
export interface SubscriptionForBillingAccess {
  status:          string;
  billingFailures: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derive the billing escalation state from a subscription row (or any object
 * that has `status` and `billingFailures`).
 *
 * This is a pure function — it never queries the DB and never throws.
 * Call it wherever you need to know if a user should see a payment-failure
 * banner or have premium features restricted.
 *
 * @example
 *   const sub = await prisma.subscription.findUnique({ where: { userId }, select: { status: true, billingFailures: true } });
 *   const state = getBillingAccessState(sub ?? { status: "ACTIVE", billingFailures: 0 });
 */
export function getBillingAccessState(
  sub: SubscriptionForBillingAccess,
): BillingAccessState {
  const isPastDue   = sub.status === "PAST_DUE";
  const rawFailures = Math.max(0, sub.billingFailures);
  // Clamp to [0, 3] — 3 always means PAST_DUE
  const failureLevel = Math.min(3, rawFailures) as 0 | 1 | 2 | 3;
  const isWarning    = failureLevel >= 1;

  return {
    canUsePremiumFeatures: !isPastDue,
    isPastDue,
    isWarning,
    failureLevel,
  };
}
