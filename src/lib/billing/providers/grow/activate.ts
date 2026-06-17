/**
 * src/lib/billing/providers/grow/activate.ts — the verification/activation BRIDGE.
 *
 * Single, idempotent attempt: load the user's pending Grow token-setup checkout →
 * verify with getPaymentProcessInfo (verify-then-trust; the redirect is only a
 * trigger) → on all cross-checks: seal the cardToken encrypted (GROW_SAAS_CHARGE_TOKEN)
 * + move Subscription INCOMPLETE → TRIALING. The /billing/grow/success page (and the
 * /api/billing/grow/verify poller) call this; never trust the redirect to activate.
 *
 * NEVER logs the cardToken. No charge. No webhook.
 */

import { prisma } from "@/lib/prisma";
import { TRIAL_DAYS } from "@/lib/plans";
import { storeGrowSaasToken } from "@/lib/billing/secrets";
import { SecretConflictError } from "@/lib/secrets/errors";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { getGrowSaasProcessInfo } from "./getPaymentProcessInfo.http";
import { findSavedToken } from "./parse-response";
import { tokenSetupCField1 } from "./request-builder";

export type GrowActivationState = "trial_started" | "pending" | "failed" | "no_checkout";

export interface GrowActivationResult {
  state: GrowActivationState;
  trialEndsAt?: Date;
}

export async function verifyAndActivateGrowTokenSetup(args: {
  userId: string;
}): Promise<GrowActivationResult> {
  // Latest pending Grow token-setup checkout for this user.
  const checkout = await prisma.billingCheckout.findFirst({
    where: { userId: args.userId, status: "PENDING", growProcessId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, order: true, plan: true, interval: true, growProcessId: true, growProcessToken: true },
  });
  if (!checkout?.growProcessId || !checkout.growProcessToken) return { state: "no_checkout" };

  // Authoritative re-fetch using the handles WE stored (not the redirect).
  const info = await getGrowSaasProcessInfo({
    processId: checkout.growProcessId,
    processToken: checkout.growProcessToken,
  });
  if (!info.ok) return { state: "pending" }; // transient — let the poller retry

  const saved = findSavedToken(info.data);

  // ── Cross-checks (all must hold to activate) ──
  const cFieldOk = saved?.cField1 === tokenSetupCField1(checkout.order);
  const processOk = saved?.processId == null || saved.processId === checkout.growProcessId;
  const tokenOk = !!saved?.cardToken;
  const statusOk = saved?.statusCode === "11";

  if (!(saved && statusOk && tokenOk && cFieldOk && processOk)) {
    // A definite negative (token saved with a different status, or an identity
    // mismatch) is a failure; otherwise it is still processing → pending.
    const mismatch = !!saved && (saved.statusCode != null && saved.statusCode !== "11" ? true : !cFieldOk || !processOk);
    return { state: mismatch ? "failed" : "pending" };
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: args.userId },
    select: { id: true },
  });
  if (!sub) return { state: "failed" };

  // Seal the token (idempotent: a partial prior run already sealed it).
  try {
    await storeGrowSaasToken({
      subscriptionId: sub.id,
      plaintext: saved.cardToken as string,
      reason: "grow saas token setup",
    });
  } catch (err) {
    if (!(err instanceof SecretConflictError)) throw err; // already sealed → continue
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  // Activate: INCOMPLETE → TRIALING. The status guard makes this idempotent.
  const activated = await prisma.subscription.updateMany({
    where: { userId: args.userId, status: "INCOMPLETE" },
    data: {
      status: "TRIALING",
      plan: checkout.plan,
      billingInterval: checkout.interval,
      billingProvider: "grow",
      cardLast4: saved.cardSuffix,
      tokenCreatedAt: now,
      trialEndsAt,
      nextBillingAt: trialEndsAt,
    },
  });

  // Resolve the checkout (idempotent).
  await prisma.billingCheckout.updateMany({
    where: { id: checkout.id, status: "PENDING" },
    data: { status: "SUCCEEDED", resolvedAt: now, cardMask: saved.cardSuffix },
  });

  if (activated.count === 1) {
    await prisma.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        event: "trial_started",
        fromStatus: "INCOMPLETE",
        toStatus: "TRIALING",
        source: "system",
      },
    });
    await logAuditEvent({
      userId: args.userId,
      action: "subscription.activated",
      entityType: "subscription",
      entityId: sub.id,
      metadata: { provider: "grow", source: "getPaymentProcessInfo", plan: checkout.plan },
    });
    return { state: "trial_started", trialEndsAt };
  }

  // count 0 → a prior run already transitioned. Confirm it's our TRIALING state.
  const cur = await prisma.subscription.findUnique({
    where: { userId: args.userId },
    select: { status: true },
  });
  return cur?.status === "TRIALING" ? { state: "trial_started" } : { state: "failed" };
}
