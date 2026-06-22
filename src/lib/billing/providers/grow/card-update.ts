/**
 * src/lib/billing/providers/grow/card-update.ts — verification/activation BRIDGE for the
 * Grow Rail A CARD-UPDATE + RECOVERY flows (existing users replacing their saved cardToken).
 *
 * Mirrors activate.ts (verify-then-trust via getPaymentProcessInfo — the redirect is only a
 * trigger), but:
 *   - matches checkouts with purpose ∈ ("payment_method_update","recovery") and cField1
 *     "saas_card_update:<order>" (distinct from onboarding's "saas_token_setup:");
 *   - ROTATES the existing token (rotateGrowSaasToken) rather than store;
 *   - is CLAIM-GATED: the PENDING→SUCCEEDED claim is the gate, and ONLY the winning claim
 *     rotates — so a concurrent poller + bridge can never double-rotate;
 *   - branches by purpose: payment_method_update = card fields only; recovery = also clears
 *     billingFailures, sets ACTIVE, and re-arms nextBillingAt=now (the recurring cron then
 *     charges the NEW token on its next run — NO charge happens here).
 *
 * NEVER logs the cardToken / processToken / apiKey. No charge. No webhook.
 */

import { prisma } from "@/lib/prisma";
import { rotateGrowSaasToken } from "@/lib/billing/secrets";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getGrowSaasProcessInfo } from "./getPaymentProcessInfo.http";
import { findSavedToken } from "./parse-response";
import { cardUpdateCField1 } from "./request-builder";

export type GrowCardUpdateState = "applied" | "pending" | "failed" | "no_checkout";

export interface GrowCardUpdateResult {
  state: GrowCardUpdateState;
}

export async function verifyAndApplyGrowCardUpdate(args: {
  userId: string;
}): Promise<GrowCardUpdateResult> {
  const result = await resolve(args);
  // No-secret breadcrumb: STATE only — never cardToken / processToken / apiKey.
  console.log(`[billing/grow/card-update] state=${result.state} userId=${args.userId.slice(0, 8)}…`);
  return result;
}

async function resolve(args: { userId: string }): Promise<GrowCardUpdateResult> {
  // Latest pending card-update / recovery checkout for this user.
  const checkout = await prisma.billingCheckout.findFirst({
    where: {
      userId: args.userId,
      status: "PENDING",
      growProcessId: { not: null },
      purpose: { in: ["payment_method_update", "recovery"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, order: true, purpose: true, growProcessId: true, growProcessToken: true },
  });
  if (!checkout?.growProcessId || !checkout.growProcessToken) return { state: "no_checkout" };

  // Authoritative re-fetch using the handles WE stored (not the redirect).
  const info = await getGrowSaasProcessInfo({
    processId: checkout.growProcessId,
    processToken: checkout.growProcessToken,
  });
  if (!info.ok) return { state: "pending" }; // transient — let the poller retry

  const saved = findSavedToken(info.data);

  // ── Cross-checks (all must hold; cField1 namespace must be the card-update one) ──
  const cFieldOk = saved?.cField1 === cardUpdateCField1(checkout.order);
  const processOk = saved?.processId == null || saved.processId === checkout.growProcessId;
  const tokenOk = !!saved?.cardToken;
  const statusOk = saved?.statusCode === "11";

  if (!(saved && statusOk && tokenOk && cFieldOk && processOk)) {
    const mismatch = !!saved && (saved.statusCode != null && saved.statusCode !== "11" ? true : !cFieldOk || !processOk);
    return { state: mismatch ? "failed" : "pending" };
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: args.userId },
    select: { id: true },
  });
  if (!sub) return { state: "failed" };

  // ── CLAIM the checkout (the gate). Atomic PENDING→SUCCEEDED: only ONE concurrent
  //    runner wins (count===1) and rotates; losers (count===0) return without rotating. ──
  const claim = await prisma.billingCheckout.updateMany({
    where: { id: checkout.id, status: "PENDING" },
    data: { status: "SUCCEEDED", resolvedAt: new Date(), cardMask: saved.cardSuffix },
  });
  if (claim.count === 0) return { state: "applied" }; // already applied by another runner

  // ── Winner: rotate the sealed token to the NEW value (re-points growSaasChargeSecretRef) ──
  await rotateGrowSaasToken({
    subscriptionId: sub.id,
    plaintext: saved.cardToken as string,
    reason: checkout.purpose === "recovery" ? "grow saas billing recovery" : "grow saas card update",
  });

  const now = new Date();

  if (checkout.purpose === "recovery") {
    // Recovery: re-seal + clear failures + ACTIVE + re-arm so the cron charges the new card.
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cardLast4: saved.cardSuffix,
        tokenCreatedAt: now,
        billingFailures: 0,
        status: "ACTIVE",
        nextBillingAt: now,
      },
    });
    await prisma.subscriptionEvent.create({
      data: { subscriptionId: sub.id, event: "payment_recovered", toStatus: "ACTIVE", source: "system" },
    });
    await logAuditEvent({
      userId: args.userId,
      action: "subscription.payment.recovered",
      entityType: "subscription",
      entityId: sub.id,
      metadata: { provider: "grow", source: "card_update", cardLast4: saved.cardSuffix },
    });
  } else {
    // payment_method_update: card fields ONLY — never touch status/billingFailures/nextBillingAt.
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { cardLast4: saved.cardSuffix, tokenCreatedAt: now },
    });
    await prisma.subscriptionEvent.create({
      data: { subscriptionId: sub.id, event: "payment_method_updated", source: "system" },
    });
    await logAuditEvent({
      userId: args.userId,
      action: "subscription.payment_method.updated",
      entityType: "subscription",
      entityId: sub.id,
      metadata: { provider: "grow", source: "card_update", cardLast4: saved.cardSuffix },
    });
  }

  return { state: "applied" };
}
