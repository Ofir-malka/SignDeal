/**
 * src/lib/billing/recurring-chargers.ts — the recurring-charge SEAM.
 *
 * One narrow boundary between the provider-neutral recurring engine (recurring.ts — edited in a
 * later step) and the per-provider charge call. The engine builds a RecurringChargeContext and
 * calls getRecurringCharger(provider, mode).charge(ctx); the result is a NEUTRAL
 * RecurringChargeOutcome the engine maps to hyp* / grow* columns. No DB, no logging, no .reveal().
 *
 * Final state (Grow-only): the provider-multiplexing "hyp" branch is deleted with HYP; the Grow +
 * stub chargers and this neutral contract remain. The HYP charger below is a TEMPORARY rollback
 * wrapper — it adds NO new HYP charging logic (it forwards to the unchanged callHypSoft).
 */

import { callHypSoft } from "./providers/hyp"; // TEMPORARY(hyp-removal): rollback-only HYP charger
import { chargeGrowRecurring } from "./providers/grow/recurring-charger";

/**
 * Neutral, provider-agnostic charge outcome. The engine never sees HYP `cCode` / Grow `statusCode`
 * directly — only this shape. `failure: "declined"` dunns the card; `failure: "error"` is an
 * integration fault (no dunning) — see the Grow classifier.
 */
export type RecurringChargeOutcome =
  | { ok: true; providerTxId: string | null; providerCode: string; authCode: string | null }
  | { ok: false; failure: "declined" | "error"; providerTxId: string | null; providerCode: string | null; reasonTag?: string };

/** Everything a charger needs for one charge. HYP-only fields are populated by the engine preflight. */
export interface RecurringChargeContext {
  billingProvider: "hyp" | "grow";
  subscriptionId: string;
  userId: string;
  /** BillingCharge.id — order/correlation + (Grow) transactionUniqueIdentifier seed. */
  chargeId: string;
  amountAgorot: number;
  amountShekels: number;
  /** Description / label shown on the charge (e.g. "plan · interval"). */
  info: string;
  // ── HYP-only (TEMPORARY(hyp-removal)) — the engine loads these before charging; Grow ignores them ──
  hypChargeToken?: string | null;
  hypCardExpMonth?: number | null;
  hypCardExpYear?: number | null;
}

export interface RecurringCharger {
  readonly provider: "hyp" | "grow";
  charge(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome>;
}

// TEMPORARY(hyp-removal): thin wrapper over the UNCHANGED callHypSoft — no new HYP logic.
class HypRecurringCharger implements RecurringCharger {
  readonly provider = "hyp" as const;
  async charge(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome> {
    // The engine's HYP preflight guarantees a chargeToken + expiry before charging; guard defensively.
    if (!ctx.hypChargeToken || ctx.hypCardExpMonth == null || ctx.hypCardExpYear == null) {
      return { ok: false, failure: "error", providerTxId: null, providerCode: null, reasonTag: "ERR_HYP_CONTEXT_MISSING" };
    }
    const r = await callHypSoft({
      chargeToken: ctx.hypChargeToken,
      amountShekels: ctx.amountShekels,
      cardExpMonth: ctx.hypCardExpMonth,
      cardExpYear: ctx.hypCardExpYear,
      order: ctx.chargeId,
      info: ctx.info,
    });
    return r.ok
      ? { ok: true, providerTxId: r.hypTransId, providerCode: r.cCode, authCode: r.authCode }
      : { ok: false, failure: "declined", providerTxId: r.hypTransId, providerCode: r.cCode };
  }
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
  constructor(readonly provider: "hyp" | "grow") {}
  async charge(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome> {
    return {
      ok: true,
      providerTxId: `stub-${ctx.chargeId}`,
      providerCode: this.provider === "grow" ? "2" : "0",
      authCode: "STUB",
    };
  }
}

export function getRecurringCharger(provider: "hyp" | "grow", mode: "real" | "stub"): RecurringCharger {
  if (mode === "stub") return new StubRecurringCharger(provider);
  // TEMPORARY(hyp-removal): the "hyp" branch is deleted at cutover; Grow + stub remain.
  return provider === "grow" ? new GrowRecurringCharger() : new HypRecurringCharger();
}
