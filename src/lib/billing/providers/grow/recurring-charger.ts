/**
 * src/lib/billing/providers/grow/recurring-charger.ts — Grow Rail A recurring-charge adapter.
 *
 * Bridges the neutral charger seam to the Grow charge flow: calls the Step-2 HTTP layer
 * (createTransactionWithToken — the ONLY reveal site) and the Step-1 classifier, then maps the
 * classification to a neutral RecurringChargeOutcome. No DB, no logging, no .reveal() here.
 *
 * SERVER-TO-GROW CHARGE only — this is NOT a Grow → SignDeal webhook.
 */

import type { RecurringChargeContext, RecurringChargeOutcome } from "../../recurring-chargers";
import { createGrowSaasTokenCharge } from "./createTransactionWithToken.http";
import { classifyGrowCharge } from "./status-codes";

export async function chargeGrowRecurring(ctx: RecurringChargeContext): Promise<RecurringChargeOutcome> {
  const res = await createGrowSaasTokenCharge({
    subscriptionId: ctx.subscriptionId,
    amountAgorot: ctx.amountAgorot,
    chargeId: ctx.chargeId,
    description: ctx.info,
  });

  const cls = classifyGrowCharge(res);

  if (cls.outcome === "paid") {
    return {
      ok: true,
      providerTxId: cls.transactionId,
      providerCode: cls.statusCode ?? "2",
      authCode: cls.approvalCode,
    };
  }

  // "declined" (dunned) | "error" (integration fault, no dunning) — same neutral shape.
  return {
    ok: false,
    failure: cls.outcome,
    providerTxId: cls.transactionId,
    providerCode: cls.statusCode,
    reasonTag: cls.reasonTag ?? undefined,
  };
}
