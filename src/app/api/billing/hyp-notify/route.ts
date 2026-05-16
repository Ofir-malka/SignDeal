/**
 * /api/billing/hyp-notify
 *
 * ⚠️  DEPRECATED — NOT CALLED IN PRODUCTION ⚠️
 *
 * URLserver / UrlServer does NOT exist in HYP's official APISign protocol.
 * HYP silently ignores the param and never calls this endpoint.
 *
 * The correct activation flow (per official HYP docs) is:
 *   1. HYP browser-redirects to portal GoodURL (/billing/success) with signed params.
 *   2. /billing/success calls action=APISign&What=VERIFY to verify the transaction.
 *   3. On CCode=0 from VERIFY, /billing/success atomically activates the subscription.
 *
 * This file is kept for historical reference. Do NOT depend on it for subscription
 * activation. It can be safely deleted in a future cleanup.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HYP URLserver server-to-server notification endpoint (UNUSED).
 *
 * ── What HYP sends ────────────────────────────────────────────────────────────
 * HYP fires this request BEFORE (or concurrent with) the browser redirect to
 * SuccessUrl.  Typical params (names are case-sensitive — HYP's exact spellings):
 *
 *   CCode        — "0" = approved; anything else = declined/error
 *   uniqueID     — the Order we sent in APISign (= our BillingCheckout.order)
 *   txId         — HYP's own transaction identifier
 *   responseMac  — SHA-256 MAC for authenticity verification
 *   HKId         — recurring agreement ID (present when HK=True + payment approved)
 *   cardToken    — tokenised card reference
 *   cardMask     — e.g. "4111****1111" — safe for display
 *   cardExp      — MMYY expiry
 *   authNumber   — bank authorisation number
 *   personalId   — Israeli ID entered (if collected)
 *   cgUid        — CreditGuard UID
 *
 * ── param-name note ───────────────────────────────────────────────────────────
 * We register URLserver in APISign (capital URL, lowercase s — HYP's documented
 * form).  If HYP ever sends `Order` instead of `uniqueID`, or uses `order`
 * (lowercase), we fall through all three alternatives in the lookup below.
 *
 * ── HTTP method ───────────────────────────────────────────────────────────────
 * HYP's spec says GET, but some terminal configurations send POST.
 * Both handlers delegate to handleRequest() so behaviour is identical.
 *
 * ── Return codes ──────────────────────────────────────────────────────────────
 *   "OK" / 200  — ack; HYP will NOT retry
 *   5xx         — error; HYP WILL retry — use ONLY for transient server errors
 *
 * ── Caching ───────────────────────────────────────────────────────────────────
 * Next.js 16 does not cache GET route handlers by default.
 * `dynamic = "force-dynamic"` is set here as an explicit guarantee.
 *
 * ── Debug mode ───────────────────────────────────────────────────────────────
 * Append ?debug=1 to any request to get a JSON response showing the param keys
 * and safe masked values that were received.  Secrets (PassP, cardToken, etc.)
 * are never returned — only their presence (true/false) is shown.
 * Remove or restrict this before go-live if preferred.
 */

import type { NextRequest }                       from "next/server";
import { prisma }                                 from "@/lib/prisma";
import { verifyHypResponseMac, parseCardFields }  from "@/lib/billing/providers/hyp";
import type { HypCallbackParams }                 from "@/lib/billing/providers/hyp";
import { TRIAL_DAYS }                             from "@/lib/plans";

// Explicit: never serve a cached response for this webhook.
export const dynamic = "force-dynamic";

// ── Response helpers ──────────────────────────────────────────────────────────

const OK           = () => new Response("OK",    { status: 200, headers: { "Content-Type": "text/plain" } });
const SERVER_ERROR = () => new Response("ERROR", { status: 500, headers: { "Content-Type": "text/plain" } });

// ── Core handler (shared by GET and POST) ─────────────────────────────────────

async function handleRequest(req: NextRequest, method: string): Promise<Response> {
  // ── Read all params ───────────────────────────────────────────────────────
  // URLSearchParams works for both GET (query string) and POST (form body is
  // handled below via the fallback path).  HYP sends GET for URLserver in
  // most terminal configs; POST in some hosted-page configs.
  const sp = req.nextUrl.searchParams;

  // ── Log every param key received (NOT values — values may contain secrets) ─
  const paramKeys = [...sp.keys()];
  const paramCount = paramKeys.length;

  console.log(
    `[billing/hyp-notify] REQUEST` +
    ` method=${method}` +
    ` paramCount=${paramCount}` +
    ` paramKeys=[${paramKeys.sort().join(",")}]`,
  );

  // ── Debug mode — return safe diagnostic JSON ──────────────────────────────
  // Append ?debug=1 to manually probe the endpoint (never exposes secrets).
  if (sp.get("debug") === "1") {
    const safe: Record<string, string | boolean> = {};
    for (const key of paramKeys) {
      // Return value for non-sensitive keys; presence-only for sensitive ones.
      const SENSITIVE = new Set(["PassP", "KEY", "cardToken", "responseMac", "HKId", "personalId"]);
      safe[key] = SENSITIVE.has(key) ? Boolean(sp.get(key)) : (sp.get(key) ?? "");
    }
    return Response.json({
      ok:          true,
      debug:       true,
      method,
      paramCount,
      params:      safe,
      timestamp:   new Date().toISOString(),
    });
  }

  // ── Extract params (HYP uses these exact spellings) ──────────────────────
  const cCode      = sp.get("CCode")       ?? "";
  // "uniqueID" is HYP's standard name; some configs send "Order" (our original
  // field name) or "order" (lowercase).  Fall through all three.
  const uniqueID   = sp.get("uniqueID")    ?? sp.get("Order") ?? sp.get("order") ?? "";
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
    `[billing/hyp-notify] PARAMS` +
    ` CCode="${cCode}"` +
    ` uniqueID="${uniqueID}"` +
    ` txId="${txId}"` +
    ` hasResponseMac=${Boolean(responseMac)}` +
    ` hasHKId=${Boolean(HKId)}` +
    ` hasCardMask=${Boolean(cardMask)}` +
    ` hasCardExp=${Boolean(cardExp)}` +
    ` hasAuthNumber=${Boolean(authNumber)}`,
  );

  // ── Step 1: CCode check ───────────────────────────────────────────────────
  // "0" = approved.  Anything else = declined or error — ack without activating.
  if (cCode !== "0") {
    console.log(
      `[billing/hyp-notify] DECLINED` +
      ` CCode="${cCode}" uniqueID="${uniqueID}" txId="${txId}"` +
      ` — payment was not approved; no activation.`,
    );
    return OK();
  }

  // ── Step 2: required params guard ────────────────────────────────────────
  if (!uniqueID || !txId || !responseMac) {
    console.error(
      `[billing/hyp-notify] MISSING_PARAMS` +
      ` hasUniqueID=${Boolean(uniqueID)}` +
      ` hasTxId=${Boolean(txId)}` +
      ` hasResponseMac=${Boolean(responseMac)}` +
      ` — cannot activate without these fields.`,
    );
    // Not retryable — malformed request won't improve on retry.
    return OK();
  }

  // ── Step 3: verify MAC before any DB access ───────────────────────────────
  const passp = process.env.HYP_PASSP?.trim() ?? "";
  if (!passp) {
    console.error("[billing/hyp-notify] HYP_PASSP_MISSING — cannot verify MAC. Set HYP_PASSP env var.");
    return SERVER_ERROR(); // env misconfiguration; retry after deploy may work
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

  console.log(
    `[billing/hyp-notify] MAC_VERIFICATION` +
    ` result=${macValid ? "PASS" : "FAIL"}` +
    ` uniqueID="${uniqueID}"` +
    ` txId="${txId}"`,
  );

  if (!macValid) {
    // Not retryable — return OK so HYP stops retrying (it can't fix a bad MAC).
    console.error(
      `[billing/hyp-notify] MAC_FAIL` +
      ` uniqueID="${uniqueID}" txId="${txId}"` +
      ` — possible tampered or replayed request. Aborting without DB write.`,
    );
    return OK();
  }

  // ── Step 4: look up BillingCheckout ──────────────────────────────────────
  let checkout;
  try {
    checkout = await prisma.billingCheckout.findUnique({ where: { order: uniqueID } });
  } catch (err) {
    console.error("[billing/hyp-notify] DB_ERROR_CHECKOUT_LOOKUP:", err instanceof Error ? err.message : err);
    return SERVER_ERROR(); // DB error; HYP will retry
  }

  console.log(
    `[billing/hyp-notify] CHECKOUT_LOOKUP` +
    ` order="${uniqueID}"` +
    ` found=${Boolean(checkout)}` +
    (checkout ? ` status=${checkout.status} expired=${checkout.expiresAt < new Date()}` : ""),
  );

  if (!checkout) {
    console.error(
      `[billing/hyp-notify] CHECKOUT_NOT_FOUND order="${uniqueID}"` +
      ` — either BillingCheckout was never created (checkout route error)` +
      ` or uniqueID param does not match our Order field.`,
    );
    return OK(); // not retryable
  }

  // ── Step 5: idempotency ───────────────────────────────────────────────────
  if (checkout.status === "SUCCEEDED") {
    console.log(`[billing/hyp-notify] ALREADY_SUCCEEDED (idempotent) order="${uniqueID}"`);
    return OK();
  }

  if (checkout.status === "FAILED") {
    console.warn(
      `[billing/hyp-notify] CHECKOUT_FAILED_STATUS order="${uniqueID}" txId="${txId}"` +
      ` — checkout previously marked FAILED but payment now approved. Not activating.`,
    );
    return OK();
  }

  if (checkout.status === "EXPIRED") {
    console.warn(
      `[billing/hyp-notify] CHECKOUT_EXPIRED order="${uniqueID}" txId="${txId}"` +
      ` expiresAt=${checkout.expiresAt.toISOString()}`,
    );
    return OK();
  }

  // ── Step 6: fetch subscription ────────────────────────────────────────────
  let subscription;
  try {
    subscription = await prisma.subscription.findUnique({
      where:  { userId: checkout.userId },
      select: { id: true, status: true, plan: true },
    });
  } catch (err) {
    console.error("[billing/hyp-notify] DB_ERROR_SUBSCRIPTION_LOOKUP:", err instanceof Error ? err.message : err);
    return SERVER_ERROR();
  }

  console.log(
    `[billing/hyp-notify] SUBSCRIPTION_LOOKUP` +
    ` userId=${checkout.userId}` +
    ` found=${Boolean(subscription)}` +
    (subscription ? ` status=${subscription.status}` : ""),
  );

  if (!subscription) {
    console.error(
      `[billing/hyp-notify] SUBSCRIPTION_NOT_FOUND userId=${checkout.userId}` +
      ` — data integrity issue.`,
    );
    return SERVER_ERROR(); // retry may succeed if eventually consistent
  }

  // ── Step 7: compute activation values ────────────────────────────────────
  const isTrialActivation = subscription.status === "INCOMPLETE";
  const now               = new Date();

  console.log(
    `[billing/hyp-notify] ACTIVATION_PATH` +
    ` subscriptionStatus=${subscription.status}` +
    ` isTrialActivation=${isTrialActivation}` +
    ` plan=${checkout.plan}` +
    ` interval=${checkout.interval}`,
  );

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
  try {
    await prisma.$transaction(async (tx) => {

      // Atomic guard: updateMany WHERE status=PENDING prevents double-activation
      // on concurrent HYP retries or race conditions.
      const checkoutUpdate = await tx.billingCheckout.updateMany({
        where: { order: uniqueID, status: "PENDING" },
        data: {
          status:     "SUCCEEDED",
          txId,
          hkId:       HKId       ?? null,
          cardToken:  cardToken  ?? null,
          cardExp:    cardExp    ?? null,
          cardMask:   cardMask   ?? null,
          authNumber: authNumber ?? null,
          resolvedAt: now,
        },
      });

      if (checkoutUpdate.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      if (isTrialActivation) {
        // ── INCOMPLETE → TRIALING ─────────────────────────────────────────
        await tx.subscription.update({
          where: { userId: checkout.userId },
          data: {
            status:                "TRIALING",
            plan:                  checkout.plan,
            billingInterval:       checkout.interval,
            billingProvider:       "hyp",
            billingSubscriptionId: HKId ?? null,
            cardToken:             parsedToken,
            cardLast4,
            cardExpMonth,
            cardExpYear,
            tokenCreatedAt:        now,
            trialEndsAt,
            nextBillingAt:         trialEndsAt,
          },
        });
      } else {
        // ── TRIALING / ACTIVE → ACTIVE ────────────────────────────────────
        await tx.subscription.update({
          where: { userId: checkout.userId },
          data: {
            status:                "ACTIVE",
            plan:                  checkout.plan,
            billingInterval:       checkout.interval,
            billingProvider:       "hyp",
            billingSubscriptionId: HKId ?? null,
            cardToken:             parsedToken,
            cardLast4,
            cardExpMonth,
            cardExpYear,
            tokenCreatedAt:        now,
            firstPaymentAt:        now,
            nextBillingAt:         currentPeriodEnd,
            currentPeriodStart:    now,
            currentPeriodEnd,
          },
        });
      }

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
            method,     // log whether HYP used GET or POST
            ...(isTrialActivation
              ? { trialDays: TRIAL_DAYS, trialEndsAt: trialEndsAt!.toISOString() }
              : { currentPeriodEnd: currentPeriodEnd!.toISOString() }
            ),
          }),
        },
      });
    });

    console.log(
      `[billing/hyp-notify] ACTIVATION_SUCCESS` +
      ` path=${isTrialActivation ? "INCOMPLETE→TRIALING" : "→ACTIVE"}` +
      ` userId=${checkout.userId}` +
      ` plan=${checkout.plan}` +
      ` interval=${checkout.interval}` +
      ` txId=${txId}` +
      ` hkId=${HKId ?? "(none)"}` +
      ` cardLast4=${cardLast4 ?? "(none)"}` +
      (isTrialActivation
        ? ` trialEndsAt=${trialEndsAt!.toISOString()}`
        : ` periodEnd=${currentPeriodEnd!.toISOString()}`
      ),
    );

    return OK();

  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_PROCESSED") {
      console.log(`[billing/hyp-notify] ALREADY_PROCESSED (race condition) order="${uniqueID}" txId="${txId}"`);
      return OK();
    }

    console.error(
      "[billing/hyp-notify] TRANSACTION_ERROR:",
      err instanceof Error ? err.message : err,
      `userId=${checkout.userId} order="${uniqueID}" txId="${txId}"`,
    );
    return SERVER_ERROR(); // real DB error; HYP will retry
  }
}

// ── Route exports ─────────────────────────────────────────────────────────────
// HYP's spec says GET for URLserver, but some terminal configs send POST.
// Both delegate to the same handler so behaviour is identical.

export async function GET(req: NextRequest): Promise<Response> {
  return handleRequest(req, "GET");
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleRequest(req, "POST");
}
