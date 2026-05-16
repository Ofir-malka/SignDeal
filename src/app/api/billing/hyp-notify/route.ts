/**
 * GET /api/billing/hyp-notify
 *
 * HYP URLserver server-to-server notification endpoint.
 *
 * HYP fires this GET request BEFORE (or concurrent with) the browser redirect
 * to SuccessUrl. Because the HYP merchant portal overrides SuccessUrl with a
 * bare 302 redirect that strips all query params, we cannot activate from the
 * browser redirect — so this endpoint is the authoritative activation path.
 *
 * Protocol:
 *   • HYP sends signed GET params: CCode, uniqueID, txId, responseMac, HKId,
 *     cardToken, cardMask, cardExp, authNumber, personalId, cgUid.
 *   • We MUST return HTTP 200 / "OK" to acknowledge.
 *   • If we return 5xx, HYP will retry — use this ONLY for real server errors
 *     (DB down, env misconfiguration) that a retry could fix.
 *   • Return 200 / "OK" for all security-level failures (bad MAC, unknown order)
 *     to avoid retry storms.
 *
 * Activation flow:
 *   1. Validate CCode === "0" (non-zero = payment failed → no activation, return OK).
 *   2. Verify responseMac with HYP_PASSP BEFORE any DB read.
 *   3. Find BillingCheckout by uniqueID (= Order we issued).
 *   4. Idempotency: if already SUCCEEDED, return OK immediately.
 *   5. Atomic transaction:
 *        BillingCheckout  → SUCCEEDED (updateMany WHERE PENDING guards concurrency)
 *        Subscription     → TRIALING (INCOMPLETE path) or ACTIVE (upgrade path)
 *        SubscriptionEvent → appended for audit trail
 *   6. Return "OK".
 *
 * After this runs, /billing/success reads the DB and renders the correct UI.
 *
 * Security:
 *   • HYP_PASSP used only for MAC verification — never returned or logged.
 *   • All DB writes use checkout.userId (from our own DB) — never a query param.
 *   • Atomic updateMany WHERE status=PENDING prevents double-activation on retry.
 *   • Route is in /api/ — excluded from Next.js middleware (see proxy.ts matcher).
 *     HYP's server-to-server call carries no session cookie; no auth session needed.
 */

import type { NextRequest }                       from "next/server";
import { prisma }                                 from "@/lib/prisma";
import { verifyHypResponseMac, parseCardFields }  from "@/lib/billing/providers/hyp";
import type { HypCallbackParams }                 from "@/lib/billing/providers/hyp";
import { TRIAL_DAYS }                             from "@/lib/plans";

// ── Response helpers ──────────────────────────────────────────────────────────

const OK          = () => new Response("OK",    { status: 200, headers: { "Content-Type": "text/plain" } });
const SERVER_ERROR = () => new Response("ERROR", { status: 500, headers: { "Content-Type": "text/plain" } });

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;

  // ── Read params ───────────────────────────────────────────────────────────
  const cCode      = sp.get("CCode")       ?? "";
  const uniqueID   = sp.get("uniqueID")    ?? sp.get("Order") ?? "";
  const txId       = sp.get("txId")        ?? "";
  const responseMac = sp.get("responseMac") ?? "";
  const HKId       = sp.get("HKId")        ?? undefined;
  const cardToken  = sp.get("cardToken")   ?? undefined;
  const cardExp    = sp.get("cardExp")     ?? undefined;
  const cardMask   = sp.get("cardMask")    ?? undefined;
  const authNumber = sp.get("authNumber")  ?? undefined;
  const personalId = sp.get("personalId")  ?? undefined;
  const cgUid      = sp.get("cgUid")       ?? undefined;

  console.log(
    `[billing/hyp-notify] received` +
    ` CCode=${cCode}` +
    ` order=${uniqueID}` +
    ` txId=${txId}` +
    ` hasHKId=${Boolean(HKId)}` +
    ` hasCardMask=${Boolean(cardMask)}` +
    ` hasMAC=${Boolean(responseMac)}`,
  );

  // ── Step 1: CCode check ───────────────────────────────────────────────────
  // CCode "0" = approved. Anything else = declined / error.
  // Do NOT activate on a failed payment — just ack and return.
  if (cCode !== "0") {
    console.log(`[billing/hyp-notify] non-zero CCode=${cCode} — payment failed, no activation. order=${uniqueID}`);
    return OK();
  }

  // ── Step 2: required params ───────────────────────────────────────────────
  if (!uniqueID || !txId || !responseMac) {
    console.error("[billing/hyp-notify] missing required params", {
      hasUniqueID: Boolean(uniqueID),
      hasTxId:     Boolean(txId),
      hasMAC:      Boolean(responseMac),
    });
    // Return OK — malformed request won't improve on retry.
    return OK();
  }

  // ── Step 3: verify MAC before any DB access ───────────────────────────────
  const passp = process.env.HYP_PASSP?.trim() ?? "";
  if (!passp) {
    console.error("[billing/hyp-notify] HYP_PASSP not set — cannot verify MAC");
    return SERVER_ERROR(); // env misconfiguration; retry might work after deploy
  }

  const cbParams: HypCallbackParams = {
    uniqueID,
    txId,
    cgUid,
    cardToken,
    cardExp,
    cardMask,
    personalId,
    authNumber,
    HKId,
    responseMac,
  };

  const macValid = verifyHypResponseMac(cbParams, passp);
  console.log(`[billing/hyp-notify] MAC verification: ${macValid ? "PASS" : "FAIL"} order=${uniqueID}`);

  if (!macValid) {
    // MAC failed → this is not a retryable error; return OK to stop retry.
    console.error(`[billing/hyp-notify] MAC FAILED — potential tampered request. order=${uniqueID} txId=${txId}`);
    return OK();
  }

  // ── Step 4: look up BillingCheckout ──────────────────────────────────────
  let checkout;
  try {
    checkout = await prisma.billingCheckout.findUnique({
      where: { order: uniqueID },
    });
  } catch (err) {
    console.error("[billing/hyp-notify] DB error finding checkout:", err instanceof Error ? err.message : err);
    return SERVER_ERROR(); // DB error; retry may succeed
  }

  if (!checkout) {
    console.error(`[billing/hyp-notify] BillingCheckout not found — order=${uniqueID}`);
    // Not retryable — the checkout was never created or was deleted.
    return OK();
  }

  // ── Step 5: idempotency check ─────────────────────────────────────────────
  if (checkout.status === "SUCCEEDED") {
    console.log(`[billing/hyp-notify] already SUCCEEDED (idempotent) — order=${uniqueID}`);
    return OK();
  }

  if (checkout.status === "FAILED") {
    // Checkout was previously marked FAILED (e.g. by an error callback).
    // This SUCCESS notification contradicts that — log and ack without activating.
    console.warn(`[billing/hyp-notify] checkout status=FAILED but payment approved — order=${uniqueID} txId=${txId}`);
    return OK();
  }

  // ── Step 6: fetch subscription (pre-transition state for bifurcation + audit) ──
  let subscription;
  try {
    subscription = await prisma.subscription.findUnique({
      where:  { userId: checkout.userId },
      select: { id: true, status: true, plan: true },
    });
  } catch (err) {
    console.error("[billing/hyp-notify] DB error finding subscription:", err instanceof Error ? err.message : err);
    return SERVER_ERROR();
  }

  if (!subscription) {
    console.error(
      `[billing/hyp-notify] subscription not found — userId=${checkout.userId} order=${uniqueID}`,
    );
    return SERVER_ERROR(); // data integrity issue; retry may succeed if eventually consistent
  }

  // ── Step 7: compute activation values ────────────────────────────────────
  const isTrialActivation = subscription.status === "INCOMPLETE";
  const now               = new Date();

  const { cardToken: parsedToken, cardLast4, cardExpMonth, cardExpYear } =
    parseCardFields({ HKId, cardToken, cardMask, cardExp });

  let trialEndsAt:      Date | null = null;
  let currentPeriodEnd: Date | null = null;

  if (isTrialActivation) {
    trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  } else {
    currentPeriodEnd = new Date(now);
    if (checkout.interval === "YEARLY") {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }
  }

  // ── Step 8: atomic activation transaction ────────────────────────────────
  // updateMany WHERE status=PENDING is the concurrency guard:
  // if another request (HYP retry or page reload) processed this first, count=0.
  try {
    await prisma.$transaction(async (tx) => {

      // 8a. Mark checkout SUCCEEDED (atomic guard)
      const checkoutUpdate = await tx.billingCheckout.updateMany({
        where: { order: uniqueID, status: "PENDING" },
        data: {
          status:     "SUCCEEDED",
          txId,
          hkId:       HKId       ?? null,
          cardToken:  cardToken  ?? null,   // raw HYP cardToken (≠ parsedToken/HKId)
          cardExp:    cardExp    ?? null,   // raw MMYY — stored for Phase 3
          cardMask:   cardMask   ?? null,
          authNumber: authNumber ?? null,
          resolvedAt: now,
        },
      });

      if (checkoutUpdate.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      // 8b. Update subscription — bifurcated by activation path
      if (isTrialActivation) {
        // ── INCOMPLETE → TRIALING ─────────────────────────────────────────
        // Card stored; 14-day trial clock starts now.
        // nextBillingAt = trialEndsAt: Phase 3 cron charges on this date.
        await tx.subscription.update({
          where: { userId: checkout.userId },
          data: {
            status:               "TRIALING",
            plan:                 checkout.plan,
            billingInterval:      checkout.interval,
            billingProvider:      "hyp",
            billingSubscriptionId: HKId ?? null,  // HK agreement ID — Phase 3 cursor
            cardToken:            parsedToken,     // = HKId; used by Phase 3 to charge
            cardLast4,
            cardExpMonth,
            cardExpYear,
            tokenCreatedAt:       now,
            trialEndsAt,
            nextBillingAt:        trialEndsAt,
          },
        });
      } else {
        // ── TRIALING / ACTIVE → ACTIVE ────────────────────────────────────
        // Upgrade or re-activation. Period starts now.
        await tx.subscription.update({
          where: { userId: checkout.userId },
          data: {
            status:               "ACTIVE",
            plan:                 checkout.plan,
            billingInterval:      checkout.interval,
            billingProvider:      "hyp",
            billingSubscriptionId: HKId ?? null,
            cardToken:            parsedToken,
            cardLast4,
            cardExpMonth,
            cardExpYear,
            tokenCreatedAt:       now,
            firstPaymentAt:       now,
            nextBillingAt:        currentPeriodEnd,
            currentPeriodStart:   now,
            currentPeriodEnd,
          },
        });
      }

      // 8c. Append audit event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          event:          isTrialActivation ? "trial_started" : "payment_succeeded",
          fromPlan:       subscription.plan,
          toPlan:         checkout.plan,
          fromStatus:     subscription.status,
          toStatus:       isTrialActivation ? "TRIALING" : "ACTIVE",
          source:         "hyp_urlserver",
          actorId:        null,
          metadata:       JSON.stringify({
            txId,
            hkId:       HKId       ?? null,
            authNumber: authNumber ?? null,
            order:      uniqueID,
            cardLast4,
            ...(isTrialActivation
              ? { trialDays: TRIAL_DAYS, trialEndsAt: trialEndsAt!.toISOString() }
              : { currentPeriodEnd: currentPeriodEnd!.toISOString() }
            ),
          }),
        },
      });
    });

    console.log(
      `[billing/hyp-notify] activation SUCCESS` +
      ` path=${isTrialActivation ? "INCOMPLETE→TRIALING" : "→ACTIVE"}` +
      ` userId=${checkout.userId}` +
      ` plan=${checkout.plan}` +
      ` interval=${checkout.interval}` +
      ` txId=${txId}` +
      ` hkId=${HKId ?? "(none)"}` +
      (isTrialActivation
        ? ` trialEndsAt=${trialEndsAt!.toISOString()}`
        : ` periodEnd=${currentPeriodEnd!.toISOString()}`
      ),
    );

    return OK();

  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_PROCESSED") {
      // Concurrent HYP retry or race condition — already activated.
      console.log(`[billing/hyp-notify] ALREADY_PROCESSED (race) — order=${uniqueID} txId=${txId}`);
      return OK();
    }

    console.error(
      "[billing/hyp-notify] transaction error:",
      err instanceof Error ? err.message : err,
      `userId=${checkout.userId} order=${uniqueID} txId=${txId}`,
    );
    return SERVER_ERROR(); // real DB error; HYP will retry
  }
}
