/**
 * src/lib/billing/providers/grow/provider.ts — GrowBillingProvider (Rail A).
 *
 * Implements the BillingProvider interface for SignDeal SaaS billing via Grow's
 * token-only checkout (Get Token Only). MUST NOT write to the DB — the route
 * persists the BillingCheckout (incl. the returned grow process handles), and the
 * /billing/grow/success bridge verifies + activates.
 */

import { randomUUID } from "node:crypto";
import type { BillingProvider, CheckoutParams, CheckoutResult } from "../../index";
import { PLAN_AMOUNTS, PLAN_LABELS } from "../../amounts";
import { isGrowSaasEnabled } from "./config";
import { agorotToShekels } from "./request-builder";
import { createGrowSaasTokenCheckout } from "./createPaymentProcess.http";

export class GrowBillingProvider implements BillingProvider {
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    if (!isGrowSaasEnabled()) {
      return { ok: false, reason: "GROW_SAAS_ENABLED is off" };
    }

    const order = `sd-${randomUUID()}`;
    const amountAgorot =
      PLAN_AMOUNTS[params.plan][params.interval === "YEARLY" ? "yearly" : "monthly"];

    const res = await createGrowSaasTokenCheckout({
      order,
      sumShekels: agorotToShekels(amountAgorot),
      description: PLAN_LABELS[params.plan],
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      // Real broker identity from the profile (the route guarantees a valid phone for Grow).
      fullName: params.userName?.trim() || params.userEmail.split("@")[0] || "SignDeal",
      email: params.userEmail,
      phone: params.userPhone ?? null,
    });

    if (!res.ok) return { ok: false, reason: res.reason };

    return {
      ok: true,
      checkoutUrl: res.url,
      order,
      growProcessId: res.processId,
      growProcessToken: res.processToken ?? undefined,
    };
  }
}
