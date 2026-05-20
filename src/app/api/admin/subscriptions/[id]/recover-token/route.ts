/**
 * POST /api/admin/subscriptions/:id/recover-token
 *
 * Admin-only tool to recover a missing HYP chargeToken for a subscription
 * that completed checkout (SUCCEEDED BillingCheckout exists) but whose
 * chargeToken was never stored — typically because the initial callGetToken
 * call in /billing/success timed out or returned a non-zero CCode (non-fatal
 * error path, see /billing/success/page.tsx Phase 3A block).
 *
 * Without chargeToken the recurring billing engine cannot issue action=soft
 * charges. This endpoint retries the getToken call against HYP and stores the
 * result if successful.
 *
 * ── How the hypId (HYP TransId) is found ──────────────────────────────────────
 *   BillingCheckout.txId stores the HYP transaction ID (from the `Id` URL param
 *   on the /billing/success callback). callGetToken takes this as its `TransId`.
 *   This endpoint locates the most-recent SUCCEEDED BillingCheckout for the
 *   subscription's user that has a non-null txId, then passes it to callGetToken.
 *   If no such checkout exists, the recovery cannot proceed (422).
 *
 * ── Idempotency guard ─────────────────────────────────────────────────────────
 *   The Subscription update uses `updateMany WHERE id=sub.id AND chargeToken=null`
 *   inside a $transaction. If a concurrent admin call or the billing success page
 *   already set the token, count=0 and we return 409 rather than overwriting.
 *
 * ── Token security ────────────────────────────────────────────────────────────
 *   The 19-digit chargeToken is NEVER included in:
 *     • HTTP response bodies      • console logs
 *     • AuditLog metadata         • SubscriptionEvent metadata
 *     • Sentry events
 *   Only boolean presence and HYP CCode are surfaced.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────────
 *   • Does NOT change subscription status (EXPIRED, CANCELED subscriptions stay as-is)
 *   • Does NOT change billing schedule (nextBillingAt, billingFailures unchanged)
 *   • Does NOT trigger a charge
 *   • Does NOT activate / reactivate any subscription
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *   POST — requireAdmin() (session-cookie DB role check).
 *          Manual test:
 *            curl -X POST https://www.signdeal.co.il/api/admin/subscriptions/<id>/recover-token \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Response shapes ───────────────────────────────────────────────────────────
 *   200 { ok: true, outcome: "token_recovered", subscriptionId, cardExpMonth, cardExpYear, recoveredBy, at }
 *         — chargeToken was retrieved from HYP and stored on the subscription.
 *   409 { error: "...", subscriptionId }
 *         — chargeToken already set (either before this call or by a concurrent request).
 *   422 { error: "...", subscriptionId }
 *         — No SUCCEEDED BillingCheckout with a txId found. Cannot determine HYP TransId.
 *   404 { ok: false, outcome: "token_not_found", cCode, subscriptionId }
 *         — HYP returned ok=false (non-zero CCode). Token cannot be retrieved.
 *           Admin must inspect HYP dashboard for the transaction and resolve manually.
 *   404 { error: "Subscription not found" }
 *         — Subscription with given id does not exist.
 *   400 { error: "..." }
 *         — subscriptionId missing from path.
 *   401 / 403
 *         — Not authenticated or not an admin.
 *   502 { error: "..." }
 *         — Unexpected error during the HYP callGetToken network call.
 *   500 { error: "..." }
 *         — Unexpected internal error.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   HYP_MASOF   — HYP merchant ID (used by callGetToken internally)
 *   HYP_PASSP   — HYP password (used by callGetToken internally; never exposed)
 */

import { NextResponse }     from "next/server";
import * as Sentry           from "@sentry/nextjs";
import { prisma }            from "@/lib/prisma";
import { requireAdmin }      from "@/lib/require-admin";
import { callGetToken }      from "@/lib/billing/providers/hyp";
import { logAuditEvent }     from "@/lib/audit/log-audit-event";

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {

  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;
  const { adminId } = adminResult;

  const { id: subscriptionId } = await params;

  if (!subscriptionId) {
    return NextResponse.json({ error: "subscriptionId is required" }, { status: 400 });
  }

  console.log(
    `[/api/admin/subscriptions/recover-token] triggered` +
    ` subscriptionId=${subscriptionId} adminId=${adminId}`,
  );

  try {
    // ── 1. Load subscription ─────────────────────────────────────────────────
    // chargeToken is selected to check presence only — never logged or returned.
    const subscription = await prisma.subscription.findUnique({
      where:  { id: subscriptionId },
      select: {
        id:          true,
        userId:      true,
        status:      true,
        chargeToken: true,   // sensitive — checked for null, never surfaced
      },
    });

    if (!subscription) {
      console.warn(
        `[/api/admin/subscriptions/recover-token] NOT_FOUND` +
        ` subscriptionId=${subscriptionId}`,
      );
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    // ── 2. Guard: chargeToken already set ────────────────────────────────────
    if (subscription.chargeToken !== null) {
      console.log(
        `[/api/admin/subscriptions/recover-token] ALREADY_SET` +
        ` subscriptionId=${subscriptionId} status=${subscription.status}`,
      );
      return NextResponse.json(
        {
          error:          "chargeToken is already set — no recovery needed",
          subscriptionId,
        },
        { status: 409 },
      );
    }

    // ── 3. Find the HYP TransId from the most recent SUCCEEDED checkout ──────
    // BillingCheckout.txId stores the HYP `Id` param from the callback URL.
    // We need the most recent SUCCEEDED checkout with a non-null txId so that
    // callGetToken(txId) can retrieve the 19-digit chargeToken from HYP.
    const checkout = await prisma.billingCheckout.findFirst({
      where: {
        userId: subscription.userId,
        status: "SUCCEEDED",
        txId:   { not: null },
      },
      select: {
        id:        true,
        txId:      true,   // = HYP TransId; used for callGetToken
        purpose:   true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },   // most recent first
    });

    if (!checkout || !checkout.txId) {
      console.warn(
        `[/api/admin/subscriptions/recover-token] NO_HYP_TX_ID` +
        ` subscriptionId=${subscriptionId} userId=${subscription.userId}`,
      );
      return NextResponse.json(
        {
          error:
            "No SUCCEEDED BillingCheckout with a HYP transaction ID found for this subscription's user. " +
            "Cannot determine HYP TransId — manual HYP dashboard lookup required.",
          subscriptionId,
        },
        { status: 422 },
      );
    }

    console.log(
      `[/api/admin/subscriptions/recover-token] CALLING_GET_TOKEN` +
      ` subscriptionId=${subscriptionId}` +
      ` checkoutId=${checkout.id}` +
      ` checkoutPurpose=${checkout.purpose}`,
      // txId intentionally omitted — it is a system-internal HYP reference, not a secret,
      // but we keep it out of logs per the principle of logging only what's necessary.
    );

    // ── 4. Call HYP getToken ─────────────────────────────────────────────────
    let tokenResult: Awaited<ReturnType<typeof callGetToken>>;
    try {
      tokenResult = await callGetToken(checkout.txId);
    } catch (hypErr) {
      // Network-level failure — HYP unreachable or request timed out.
      console.error(
        `[/api/admin/subscriptions/recover-token] HYP_CALL_ERROR` +
        ` subscriptionId=${subscriptionId}:`,
        hypErr,
      );
      Sentry.captureException(hypErr, {
        tags:  { component: "admin_recover_token" },
        level: "error",
        extra: {
          subscriptionId,
          userId:     subscription.userId,
          checkoutId: checkout.id,
          // No txId, no credentials in Sentry
        },
      });
      await logAuditEvent({
        userId:     adminId,
        action:     "subscription.charge_token_recovery_failed",
        entityType: "subscription",
        entityId:   subscriptionId,
        metadata: {
          outcome:    "hyp_error",
          checkoutId: checkout.id,
          adminId,
        },
      });
      return NextResponse.json(
        { error: "HYP getToken call failed unexpectedly — check server logs" },
        { status: 502 },
      );
    }

    // ── 5a. HYP returned no token ────────────────────────────────────────────
    if (!tokenResult.ok || !tokenResult.token) {
      console.warn(
        `[/api/admin/subscriptions/recover-token] TOKEN_NOT_FOUND` +
        ` subscriptionId=${subscriptionId}` +
        ` cCode="${tokenResult.cCode}"`,
      );
      Sentry.captureMessage(
        `[admin/recover-token] HYP returned no chargeToken for subscriptionId=${subscriptionId} — cCode=${tokenResult.cCode}`,
        {
          level: "warning",
          tags:  { component: "admin_recover_token" },
          extra: {
            subscriptionId,
            userId:     subscription.userId,
            checkoutId: checkout.id,
            cCode:      tokenResult.cCode,
            resolution: "Inspect HYP dashboard for the transaction. Token may be expired or the transaction may not support tokenisation.",
          },
        },
      );
      await logAuditEvent({
        userId:     adminId,
        action:     "subscription.charge_token_recovery_failed",
        entityType: "subscription",
        entityId:   subscriptionId,
        metadata: {
          outcome:    "token_not_found",
          cCode:      tokenResult.cCode,
          checkoutId: checkout.id,
          adminId,
        },
      });
      return NextResponse.json(
        {
          ok:             false,
          outcome:        "token_not_found",
          cCode:          tokenResult.cCode,
          subscriptionId,
        },
        { status: 404 },
      );
    }

    // ── 5b. Token retrieved — store atomically ────────────────────────────────
    // updateMany WHERE chargeToken=null guards against a concurrent admin call
    // or the /billing/success handler having set the token between steps 2 and 5.
    // The token value itself is never logged or included in metadata.
    const { count } = await prisma.$transaction(async (tx) => {
      const result = await tx.subscription.updateMany({
        where: {
          id:          subscriptionId,
          chargeToken: null,   // hard guard — do not overwrite an existing token
        },
        data: {
          chargeToken: tokenResult.token!,
          // Tokef from getToken is the authoritative expiry source — override
          // whatever was stored from the initial Tmonth/Tyear callback params.
          ...(tokenResult.cardExpMonth !== null && { cardExpMonth: tokenResult.cardExpMonth }),
          ...(tokenResult.cardExpYear  !== null && { cardExpYear:  tokenResult.cardExpYear }),
        },
      });

      if (result.count > 0) {
        // Only write the SubscriptionEvent when we actually stored the token.
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId,
            event:      "charge_token_recovered",
            fromStatus: subscription.status,
            toStatus:   subscription.status,   // status unchanged
            source:     "admin",
            actorId:    adminId,
            // token value is deliberately excluded from metadata.
            metadata: JSON.stringify({
              recoveredBy: adminId,
              checkoutId:  checkout.id,
              cCode:       tokenResult.cCode,
              cardExpMonth: tokenResult.cardExpMonth,
              cardExpYear:  tokenResult.cardExpYear,
            }),
          },
        });
      }

      return result;
    });

    // ── 5c. Concurrent write won the race ────────────────────────────────────
    if (count === 0) {
      console.log(
        `[/api/admin/subscriptions/recover-token] CONCURRENT_RACE` +
        ` subscriptionId=${subscriptionId} — token was set by a concurrent request`,
      );
      return NextResponse.json(
        {
          error:          "chargeToken was set by a concurrent request — no change made",
          subscriptionId,
        },
        { status: 409 },
      );
    }

    // ── 6. Success — audit + respond ─────────────────────────────────────────
    const at = new Date().toISOString();

    console.log(
      `[/api/admin/subscriptions/recover-token] TOKEN_RECOVERED` +
      ` subscriptionId=${subscriptionId}` +
      ` cardExpMonth=${tokenResult.cardExpMonth ?? "(none)"}` +
      ` cardExpYear=${tokenResult.cardExpYear ?? "(none)"}` +
      ` adminId=${adminId}`,
      // chargeToken value intentionally NOT logged
    );

    await logAuditEvent({
      userId:     adminId,
      action:     "subscription.charge_token_recovered",
      entityType: "subscription",
      entityId:   subscriptionId,
      metadata: {
        outcome:      "token_found",
        checkoutId:   checkout.id,
        cCode:        tokenResult.cCode,
        cardExpMonth: tokenResult.cardExpMonth,
        cardExpYear:  tokenResult.cardExpYear,
        adminId,
        // chargeToken value intentionally excluded
      },
    });

    return NextResponse.json({
      ok:             true,
      outcome:        "token_recovered",
      subscriptionId,
      cardExpMonth:   tokenResult.cardExpMonth,
      cardExpYear:    tokenResult.cardExpYear,
      recoveredBy:    adminId,
      at,
    });

  } catch (err) {
    // Catch-all for unexpected errors (DB unavailable, Prisma errors, etc.)
    console.error(
      `[/api/admin/subscriptions/recover-token] UNEXPECTED_ERROR` +
      ` subscriptionId=${subscriptionId}:`,
      err,
    );
    Sentry.captureException(err, {
      tags:  { component: "admin_recover_token" },
      level: "fatal",
      extra: { subscriptionId, adminId },
    });
    return NextResponse.json(
      { error: "Unexpected error — check server logs" },
      { status: 500 },
    );
  }
}
