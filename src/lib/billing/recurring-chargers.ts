/**
 * src/lib/billing/recurring-chargers.ts — the recurring-charge SEAM (Grow-only).
 *
 * One narrow boundary between the provider-neutral recurring engine (recurring.ts) and the
 * per-provider charge call. The engine builds a RecurringChargeContext and calls
 * getRecurringCharger(provider, mode).charge(ctx); the result is a NEUTRAL
 * RecurringChargeOutcome the engine maps to grow* columns. No DB, no logging, no .reveal().
 */

import { chargeGrowRecurring } from "./providers/grow/recurring-charger";

/**
 * Neutral, provider-agnostic charge outcome. The engine never sees the Grow `statusCode`
 * directly — only this shape. `failure: "declined"` dunns the card; `failure: "error"` is an
 * integration fault (no dunning) — see the Grow classifier.
 */
export type RecurringChargeOutcome =
  | { ok: true; providerTxId: string | null; providerCode: string; authCode: string | null }
  | { ok: false; failure: "declined" | "error"; providerTxId: string | null; providerCode: string | null; reasonTag?: string };

/** Everything a charger needs for one charge. */
export interface RecurringChargeContext {
  billingProvider: "grow";
  subscriptionId: string;
  userId: string;
  /** BillingCharge.id — order/correlation + (Grow) transactionUniqueIdentifier seed. */
  chargeId: string;
  amountAgorot: number;
  amountShekels: number;
  /** Description / label shown on the charge (e.g. "plan · interval"). */
  info: string;
}

export interface RecurringCharger {
  readonly provider: "grow";
  charge(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome>;
}

// Grow Rail A charger — delegates to the Grow adapter (which uses ONLY the Step-2 HTTP layer).
class GrowRecurringCharger implements RecurringCharger {
  readonly provider = "grow" as const;
  charge(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome> {
    return chargeGrowRecurring(ctx);
  }
}

/** Full DB flow with NO provider network call — pre-money E2E testing (RECURRING_BILLING_PROVIDER=stub). */
class StubRecurringCharger implements RecurringCharger {
  constructor(readonly provider: "grow") {}
  async charge(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome> {
    return {
      ok: true,
      providerTxId: `stub-${ctx.chargeId}`,
      providerCode: "2",
      authCode: "STUB",
    };
  }
}

export function getRecurringCharger(provider: "grow", mode: "real" | "stub"): RecurringCharger {
  if (mode === "stub") return new StubRecurringCharger(provider);
  return new GrowRecurringCharger();
}
