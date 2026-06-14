import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { requireActiveSubscription } from "@/lib/subscription";
import { calculateFees, defaultFeeConfig } from "@/lib/payments/fee-calculator";
import { getPaymentProvider } from "@/lib/payments";
import { getStripeClient } from "@/lib/stripe";
import { sendSms, getSmsProviderName } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { rateLimit, getRealIp } from "@/lib/rate-limit";
import { logAuditEvent }         from "@/lib/audit/log-audit-event";
import { sendEmail, paymentRequestEmail } from "@/lib/email";
import { parsePropertyAddress } from "@/lib/format-address";
import { isGrowPaymentsEnabled, shouldUseGrowRail, isGrowPaymentLinkEnabled } from "@/lib/payments/providers/grow/config";
import { createGrowPaymentLink } from "@/lib/payments/providers/grow/createPaymentProcess.http";
import { createManagedPaymentLink } from "@/lib/payments/providers/grow/createPaymentLink.http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await params;

    // Fetch broker early — fullName for notification copy; email for Stripe metadata.
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { fullName: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ── Rate limit: double-keyed to prevent both per-contract and per-broker flooding
    // 5 requests per contract per hour — enough for retries after provider errors.
    // 15 per broker per hour across all contracts — blocks bulk automation.
    // Both limits call Rapyd (external) and send SMS; conservative caps are correct.
    const [rlContract, rlBroker] = await Promise.all([
      rateLimit(id,     "payment-request",    { max: 5,  windowMs: 60 * 60_000 }),
      rateLimit(userId, "payment-request-all", { max: 15, windowMs: 60 * 60_000 }),
    ]);
    if (!rlContract.allowed || !rlBroker.allowed) {
      const retryAfter = Math.max(rlContract.retryAfter ?? 0, rlBroker.retryAfter ?? 0);
      return NextResponse.json(
        { error: "יותר מדי בקשות תשלום — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // ── Subscription guard ────────────────────────────────────────────────────
    // Blocks EXPIRED / CANCELED / PAST_DUE / expired-trial users from
    // creating payment links and triggering external payment provider calls.
    const subBlock = await requireActiveSubscription(userId);
    if (subBlock) return subBlock;

    const contract = await prisma.contract.findFirst({
      where:  { id, userId },
      select: {
        id:              true,
        status:          true,
        commission:      true,
        propertyAddress: true,
        propertyCity:    true,
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
        payment:         true,   // needed for the PAID early-return
      },
    });
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // ── Guard: do not reset a payment that has already been collected ─────────
    // Re-creating a payment request on a PAID contract would wipe providerPaymentId,
    // paidAt, and paymentUrl — corrupting the audit trail.
    if (contract.status === "PAID") {
      return NextResponse.json(
        { error: "Contract is already paid", payment: contract.payment },
        { status: 409 },
      );
    }

    // ── Rail B: Grow branch (gated, additive) ─────────────────────────────────
    // Fires ONLY when GROW_PAYMENTS_ENABLED=true AND the broker's GrowBrokerMerchant
    // is active. PENDING_VERIFICATION / inactive / missing merchants fall through to
    // the existing Stripe/Rapyd path UNCHANGED. When the flag is off this is a single
    // boolean check — no extra query, no behavior change.
    const growEnabled = isGrowPaymentsEnabled();
    if (growEnabled) {
      const growMerchant = await prisma.growBrokerMerchant.findUnique({
        where:  { userId },
        select: { id: true, isActive: true, growUserId: true },
      });
      if (growMerchant && shouldUseGrowRail(growEnabled, growMerchant.isActive)) {
        return await handleGrowPaymentRequest(
          id,
          contract,
          userId,
          user,
          { id: growMerchant.id, growUserId: growMerchant.growUserId },
          getRealIp(request),
          request.headers.get("user-agent") ?? null,
        );
      }
    }

    // ── Provider branch: delegate Stripe payments to dedicated handler ────────
    // Rapyd / stub path continues below unchanged.
    if ((process.env.PAYMENT_PROVIDER?.trim() ?? "stub") === "stripe") {
      return await handleStripePaymentRequest(
        id, contract, userId, user,
        getRealIp(request),
        request.headers.get("user-agent") ?? null,
      );
    }

    // ── Step 1: calculate fee breakdown ──────────────────────────────────────
    const config = defaultFeeConfig();
    const fees   = calculateFees(contract.commission, config);

    const providerName = process.env.PAYMENT_PROVIDER?.trim() ?? "stub";

    // ── Step 2: persist fee breakdown (creates or resets existing to PENDING) ─
    const payment = await prisma.payment.upsert({
      where:  { contractId: id },
      create: {
        contractId:         id,
        status:             "PENDING",
        provider:           providerName,
        amount:             fees.amount,
        processorFee:       fees.processorFee,
        platformFee:        fees.platformFee,
        grossAmount:        fees.grossAmount,
        netAmount:          fees.netAmount,
        feePaidBy:          fees.feePaidBy,
        providerFeePercent: fees.providerFeePercent,
        platformFeePercent: fees.platformFeePercent,
      },
      update: {
        status:            "PENDING",
        provider:          providerName,
        paidAt:            null,
        paymentUrl:        null,   // clear stale URL on retry
        providerPaymentId: null,   // clear stale ID on retry
        amount:             fees.amount,
        processorFee:       fees.processorFee,
        platformFee:        fees.platformFee,
        grossAmount:        fees.grossAmount,
        netAmount:          fees.netAmount,
        feePaidBy:          fees.feePaidBy,
        providerFeePercent: fees.providerFeePercent,
        platformFeePercent: fees.platformFeePercent,
      },
    });

    // ── Step 3: call provider to generate a hosted payment link ──────────────
    const provider   = getPaymentProvider();
    const linkResult = await provider.createPaymentLink({
      contractId:  id,
      paymentId:   payment.id,
      amount:      fees.grossAmount,   // total charged to customer
      clientName:  contract.client.name,
      clientPhone: contract.client.phone,
      clientEmail: contract.client.email || undefined,
      description: `עמלת תיווך — ${parsePropertyAddress(contract.propertyAddress).address}, ${contract.propertyCity}`,
    });

    if (!linkResult.ok) {
      console.error("[POST /api/contracts/[id]/payment-request] provider error:", linkResult.reason);
      return NextResponse.json(
        { error: "Payment provider failed to create link", reason: linkResult.reason },
        { status: 502 },
      );
    }

    // ── Step 4: persist paymentUrl + providerPaymentId returned by provider ──
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data:  {
        paymentUrl:        linkResult.paymentUrl,
        providerPaymentId: linkResult.providerPaymentId,
      },
    });

    // ── Step 5: advance contract lifecycle to PAYMENT_PENDING ─────────────────
    // Only moves forward from SIGNED; already-PAYMENT_PENDING contracts stay put.
    await prisma.contract.updateMany({
      where: { id, status: { in: ["SIGNED", "OPENED"] } },
      data:  { status: "PAYMENT_PENDING" },
    });

    // ── Step 6: auto-send payment link via SMS ────────────────────────────────
    // Errors are swallowed — SMS failure must never fail the payment request.
    const notifyContract = {
      id:              contract.id,
      userId,
      clientId:        contract.client.id,
      propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
      client:          contract.client,
    };
    const notifyPayment = { id: updated.id, paymentUrl: updated.paymentUrl };

    await sendPaymentLinkSms(notifyContract, notifyPayment, user.fullName);

    // Email is sent after the response is flushed; after() keeps Vercel alive.
    // sendPaymentLinkEmail catches all errors internally.
    after(async () => {
      await sendPaymentLinkEmail(
        notifyContract,
        notifyPayment,
        user.fullName,
        fees.grossAmount,
      );
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts/[id]/payment-request]", error);
    return NextResponse.json({ error: "Failed to create payment request" }, { status: 500 });
  }
}

// ── Helper: auto-send payment link SMS (never throws) ────────────────────────
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendPaymentLinkSms(
  contract: {
    id:              string;
    userId:          string;
    clientId:        string;
    propertyAddress: string;
    client:          { name: string; phone: string };
  },
  payment:    { id: string; paymentUrl: string | null },
  brokerName: string,
): Promise<void> {
  try {
    if (!payment.paymentUrl) return;

    const normalizedPhone = normalizeIsraeliPhone(contract.client.phone);

    const body =
      `שלום ${contract.client.name},\n` +
      `נשלחה אליך בקשת תשלום מ-${brokerName} עבור:\n` +
      `${contract.propertyAddress}\n\n` +
      `לתשלום מאובטח:\n` +
      `${payment.paymentUrl}\n\n` +
      `SignDeal`;

    // SMS_TEST_PHONE guard — in non-production envs, only send to the test number
    const testPhone      = process.env.SMS_TEST_PHONE?.trim() ?? "";
    const normalizedTest = testPhone ? normalizeIsraeliPhone(testPhone) : "";

    if (normalizedTest && normalizedPhone !== normalizedTest) {
      console.log(`[sendPaymentLinkSms] skipped — ${normalizedPhone} is not SMS_TEST_PHONE`);
      await prisma.message.create({
        data: {
          type:           "PAYMENT_REQUEST_LINK",
          channel:        "SMS",
          provider:       getSmsProviderName(),
          body,
          contractId:     contract.id,
          clientId:       contract.clientId,
          paymentId:      payment.id,
          userId:         contract.userId,
          recipientPhone: normalizedPhone,
          status:         "CANCELED",
          failureReason:  "skipped: phone does not match SMS_TEST_PHONE",
          attempts:       0,
        },
      });
      return;
    }

    const message = await prisma.message.create({
      data: {
        type:           "PAYMENT_REQUEST_LINK",
        channel:        "SMS",
        provider:       getSmsProviderName(),
        body,
        contractId:     contract.id,
        clientId:       contract.clientId,
        paymentId:      payment.id,
        userId:         contract.userId,
        recipientPhone: normalizedPhone,
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendSms({ to: normalizedPhone, body });

    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? { status: "SENT",   providerMessageId: result.messageId, attempts: 1, lastAttemptAt: new Date() }
        : { status: "FAILED", failureReason: result.reason,        attempts: 1, lastAttemptAt: new Date() },
    });

    if (!result.ok) {
      console.error(`[sendPaymentLinkSms] SMS failed for contract ${contract.id}:`, result.reason);
    }
  } catch (err) {
    console.error("[sendPaymentLinkSms] unexpected error:", err);
  }
}

// ── Stripe Checkout payment handler ──────────────────────────────────────────
//
// Called when PAYMENT_PROVIDER=stripe. Keeps the Rapyd/stub path below
// completely untouched.
//
// Flow:
//   1. Verify broker has a COMPLETE BrokerStripeAccount.
//   2. Calculate fees (same calculator as Rapyd path).
//   3. Idempotency: if an open Checkout Session already exists for this contract
//      return its URL without creating a new session.
//   4. Upsert Payment row (create or reset stale Stripe fields to PENDING).
//   5. Create Stripe Checkout Session with destination charge + platform fee.
//   6. Persist stripeCheckoutSessionId + paymentUrl on the Payment row.
//   7. Advance Contract to PAYMENT_PENDING.
//   8. Send SMS / email with the session URL (same helpers as Rapyd path).

async function handleStripePaymentRequest(
  contractId: string,
  contract: {
    commission:      number;
    propertyAddress: string;
    propertyCity:    string;
    client: { id: string; name: string; phone: string; email: string };
  },
  userId:    string,
  user:      { fullName: string; email: string },
  ip:        string | null = null,
  userAgent: string | null = null,
): Promise<NextResponse> {
  // ── 1. Stripe client ────────────────────────────────────────────────────────
  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[payment-request/stripe] getStripeClient failed:", msg);
    return NextResponse.json(
      { error: "מערכת התשלומים אינה מוגדרת. פנה לתמיכה." },
      { status: 500 },
    );
  }

  // ── 2. Broker account guard ─────────────────────────────────────────────────
  const brokerAccount = await prisma.brokerStripeAccount.findUnique({
    where:  { userId },
    select: { onboardingStatus: true, stripeAccountId: true },
  });

  if (!brokerAccount || brokerAccount.onboardingStatus !== "COMPLETE") {
    // Provider-aware copy: never tell a Grow broker to "finish Stripe onboarding".
    // We only land in the Stripe handler here because the Grow rail did not claim
    // the request. Inspect the broker's Grow merchant to choose the right message:
    //   • active Grow merchant   → the flag is off (active + flag-on would have
    //                              routed to Grow), so the rail is temporarily down.
    //   • inactive Grow merchant → Grow onboarding still pending verification.
    //   • Stripe account present → Stripe really is the rail; keep the Stripe copy.
    //   • neither                → no rail configured at all (generic setup copy).
    const growMerchant = await prisma.growBrokerMerchant.findUnique({
      where:  { userId },
      select: { isActive: true },
    });

    let error: string;
    if (growMerchant?.isActive) {
      error = "שירות קבלת התשלומים מושבת זמנית. נסה שוב מאוחר יותר או פנה לתמיכה.";
    } else if (growMerchant) {
      error = "חשבון הסליקה שלך נמצא בתהליך אימות. נסה שוב לאחר אישור החשבון, או פנה לתמיכה.";
    } else if (brokerAccount) {
      error =
        "חשבון הברוקר אינו מוגדר לקבלת תשלומים. " +
        "השלם את ההרשמה ב-Stripe תחילה (הגדרות → קבלת תשלומים).";
    } else {
      error = "לא הוגדר אמצעי לקבלת תשלומים. עבור להגדרות → קבלת תשלומים כדי להגדיר.";
    }

    return NextResponse.json({ error }, { status: 422 });
  }

  // ── 3. Fee calculation ──────────────────────────────────────────────────────
  const config = defaultFeeConfig();
  const fees   = calculateFees(contract.commission, config);

  // application_fee_amount must be ≤ grossAmount; Stripe accepts 0.
  if (fees.platformFee > fees.grossAmount) {
    console.error(
      `[payment-request/stripe] platformFee (${fees.platformFee}) > grossAmount (${fees.grossAmount}) ` +
      `— fee config error for contractId=${contractId}`,
    );
    return NextResponse.json(
      { error: "שגיאת תצורת עמלה. פנה לתמיכה." },
      { status: 500 },
    );
  }

  // ── 4. Idempotency: reuse open Checkout Session if one already exists ───────
  const existingPayment = await prisma.payment.findUnique({
    where:  { contractId },
    select: { id: true, status: true, stripeCheckoutSessionId: true },
  });

  if (existingPayment?.status === "PENDING" && existingPayment.stripeCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(
        existingPayment.stripeCheckoutSessionId,
      );
      if (existing.status === "open" && existing.url) {
        console.log(
          `[payment-request/stripe] reusing open session` +
          ` contractId=${contractId} sessionId=${existing.id}`,
        );
        // Return the existing Payment row shape so the frontend gets paymentUrl
        const current = await prisma.payment.findUnique({
          where: { contractId },
        });
        return NextResponse.json(current, { status: 200 });
      }
      // Session expired / complete — fall through to create a fresh one
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[payment-request/stripe] could not retrieve existing session ` +
        `${existingPayment.stripeCheckoutSessionId}: ${msg} — creating new session`,
      );
    }
  }

  // ── 5. Upsert Payment row ───────────────────────────────────────────────────
  // Creates on first request; resets stale Stripe fields on retry.
  const payment = await prisma.payment.upsert({
    where:  { contractId },
    create: {
      contractId,
      status:                  "PENDING",
      provider:                "stripe",
      amount:                  fees.amount,
      grossAmount:             fees.grossAmount,
      processorFee:            fees.processorFee,
      platformFee:             fees.platformFee,
      netAmount:               fees.netAmount,
      feePaidBy:               fees.feePaidBy,
      providerFeePercent:      fees.providerFeePercent,
      platformFeePercent:      fees.platformFeePercent,
      applicationFeeAmount:    fees.applicationFeeAmount,
    },
    update: {
      status:                  "PENDING",
      provider:                "stripe",
      paidAt:                  null,
      paymentUrl:              null,
      providerPaymentId:       null,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId:   null,
      amount:                  fees.amount,
      grossAmount:             fees.grossAmount,
      processorFee:            fees.processorFee,
      platformFee:             fees.platformFee,
      netAmount:               fees.netAmount,
      feePaidBy:               fees.feePaidBy,
      providerFeePercent:      fees.providerFeePercent,
      platformFeePercent:      fees.platformFeePercent,
      applicationFeeAmount:    fees.applicationFeeAmount,
    },
    select: { id: true },
  });

  // ── 6. Create Stripe Checkout Session ───────────────────────────────────────
  const base        = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const description =
    `עמלת תיווך — ${parsePropertyAddress(contract.propertyAddress).address}, ${contract.propertyCity}`;

  // Stripe replaces {CHECKOUT_SESSION_ID} with the real session ID at redirect time.
  const successUrl = `${base}/pay/complete?contractId=${contractId}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${base}/pay/complete?contractId=${contractId}&status=cancel`;

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    // Shared metadata applied to both the Checkout Session and the underlying
    // PaymentIntent so every downstream event (webhook, dispute, refund) carries
    // full reconciliation context.  All values must be strings (Stripe requirement).
    // Keys ≤ 40 chars, values ≤ 500 chars, max 50 keys.
    const stripeMetadata: Record<string, string> = {
      contractId,
      paymentId:            payment.id,
      brokerId:             userId,
      brokerEmail:          user.email,
      connectedAccountId:   brokerAccount.stripeAccountId,
      feeMode:              fees.feePaidBy,
      grossAmount:          String(fees.grossAmount),
      netAmount:            String(fees.netAmount),
      applicationFeeAmount: String(fees.applicationFeeAmount),
      processorFeeAmount:   String(fees.processorFee),
      currency:             "ils",
      environment:          process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    };

    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency:     "ils",
            product_data: { name: description },
            unit_amount:  fees.grossAmount,  // smallest ILS unit = agora (1/100 NIS)
          },
          quantity: 1,
        },
      ],
      // Session-level metadata — visible on the Checkout Session object and in the
      // Stripe Dashboard; survives even if the PaymentIntent is detached.
      metadata: stripeMetadata,
      payment_intent_data: {
        // applicationFeeAmount covers the full Stripe cost stack.
        // BREAK_EVEN_SPLIT: = totalProcessingCost (processorFee + platformFee).
        // Legacy modes:      = platformFee only (old behaviour; see fee-calculator.ts).
        application_fee_amount: fees.applicationFeeAmount,
        // Destination charge — Stripe automatically transfers net to the broker's
        // Express account after the platform fee is deducted.
        transfer_data: {
          destination: brokerAccount.stripeAccountId,
        },
        // PaymentIntent-level metadata — copied to every charge, dispute, and refund
        // object so webhook handlers and Stripe Radar rules have full context.
        metadata: stripeMetadata,
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[payment-request/stripe] checkout.sessions.create failed` +
      ` contractId=${contractId}: ${msg}`,
    );
    return NextResponse.json(
      { error: "שגיאה ביצירת דף התשלום. נסה שנית." },
      { status: 502 },
    );
  }

  if (!session.url) {
    // Stripe always sets url for mode=payment, but guard defensively.
    console.error(
      `[payment-request/stripe] session ${session.id} returned no URL — unexpected`,
    );
    return NextResponse.json(
      { error: "שגיאה ביצירת קישור תשלום." },
      { status: 502 },
    );
  }

  // ── 7. Persist Checkout Session ID + URL ────────────────────────────────────
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data:  {
      stripeCheckoutSessionId: session.id,
      paymentUrl:              session.url,
    },
  });

  // ── 8. Advance Contract to PAYMENT_PENDING ──────────────────────────────────
  await prisma.contract.updateMany({
    where: { id: contractId, status: { in: ["SIGNED", "OPENED"] } },
    data:  { status: "PAYMENT_PENDING" },
  });

  console.log(
    `[payment-request/stripe] session created` +
    ` contractId=${contractId} sessionId=${session.id} paymentId=${payment.id}`,
  );

  // ── Audit log: payment request created (Stripe path) ───────────────────────
  await logAuditEvent({
    userId,
    action:     "contract.payment_request.created",
    entityType: "payment",
    entityId:   updated.id,
    metadata:   {
      provider:   "stripe",
      amount:     fees.amount,
      feePaidBy:  fees.feePaidBy,
      contractId,
    },
    ip,
    userAgent,
  });

  // ── 9. Send SMS / email with the Stripe Checkout URL ───────────────────────
  // Same helpers as the Rapyd path — paymentUrl is the hosted Stripe Checkout URL.
  const notifyContract = {
    id:              contractId,
    userId,
    clientId:        contract.client.id,
    propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
    client:          contract.client,
  };
  const notifyPayment = { id: updated.id, paymentUrl: updated.paymentUrl };

  await sendPaymentLinkSms(notifyContract, notifyPayment, user.fullName);

  after(async () => {
    await sendPaymentLinkEmail(
      notifyContract,
      notifyPayment,
      user.fullName,
      fees.grossAmount,
    );
  });

  return NextResponse.json(updated, { status: 201 });
}

// ── Rail B: Grow payment handler (createPaymentProcess) ──────────────────────
//
// Called ONLY from the gated Grow branch (flag on + active merchant). Mirrors
// handleStripePaymentRequest: fee calc → Payment upsert (PENDING) → Grow
// createPaymentProcess → persist hosted url + process id/token → Contract
// PAYMENT_PENDING → reuse the SMS/email delivery.
//
// Step 1 scope: create-link only. NO webhook, NO paid-marking (status stays
// PENDING until the Step-2 webhook confirms). Stripe/Rapyd paths untouched.
async function handleGrowPaymentRequest(
  contractId: string,
  contract: {
    commission:      number;
    propertyAddress: string;
    propertyCity:    string;
    client: { id: string; name: string; phone: string; email: string };
  },
  userId:       string,
  user:         { fullName: string; email: string },
  growMerchant: { id: string; growUserId: string | null },
  ip:           string | null = null,
  userAgent:    string | null = null,
): Promise<NextResponse> {
  if (!growMerchant.growUserId) {
    return NextResponse.json(
      { error: "חשבון הסליקה של Grow אינו מוכן (חסר מזהה עסק)." },
      { status: 422 },
    );
  }

  // ── Amount: COMMISSION ONLY (no Stripe gross-up) ───────────────────────────
  // Rail B business rule: the client pays exactly the brokerage commission. Grow's
  // processing fees are settled between Grow and the broker and are NEVER grossed
  // onto the client. We therefore deliberately bypass calculateFees() /
  // BREAK_EVEN_SPLIT here (that logic models the Stripe cost stack) and store a
  // flat, provider-blind snapshot: client amount = commission, broker net =
  // commission, all Stripe-cost fields zeroed, feePaidBy = BROKER.
  const clientAmount = contract.commission; // agorot

  // ── Upsert Payment (create or reset stale Grow fields to PENDING) ──────────
  const payment = await prisma.payment.upsert({
    where:  { contractId },
    create: {
      contractId,
      status:             "PENDING",
      provider:           "grow",
      routedProvider:     "grow",
      amount:             clientAmount,
      grossAmount:        clientAmount,
      processorFee:       0,
      platformFee:        0,
      netAmount:          clientAmount,
      feePaidBy:          "BROKER",
      providerFeePercent: 0,
      platformFeePercent: 0,
    },
    update: {
      status:             "PENDING",
      provider:           "grow",
      routedProvider:     "grow",
      paidAt:             null,
      paymentUrl:         null,
      providerPaymentId:  null,
      growProcessId:      null,
      growProcessToken:   null,
      amount:             clientAmount,
      grossAmount:        clientAmount,
      processorFee:       0,
      platformFee:        0,
      netAmount:          clientAmount,
      feePaidBy:          "BROKER",
      providerFeePercent: 0,
      platformFeePercent: 0,
    },
    select: { id: true },
  });

  // ── Call Grow to create the client payment link (reveals the broker key internally) ─
  // GROW_PAYMENT_LINK_ENABLED selects the flow WITHIN the Grow rail:
  //   on  → CreatePaymentLink   (managed, long-lived link on grow.link)
  //   off → createPaymentProcess (hosted checkout on meshulam.co.il) — fallback
  // Both return the same GrowCreatePaymentResult, so the persist / SMS / email below
  // is shared and unchanged. grossAmountAgorot carries the commission only (P0).
  const linkArgs = {
    merchantId:        growMerchant.id,
    growUserId:        growMerchant.growUserId,
    contractId,
    paymentId:         payment.id,
    grossAmountAgorot: clientAmount,
    clientName:        contract.client.name,
    clientPhone:       contract.client.phone,
    clientEmail:       contract.client.email || null,
    description:       `עמלת תיווך — ${parsePropertyAddress(contract.propertyAddress).address}, ${contract.propertyCity}`,
  };
  const linkResult = isGrowPaymentLinkEnabled()
    ? await createManagedPaymentLink(linkArgs)
    : await createGrowPaymentLink(linkArgs);

  if (!linkResult.ok) {
    console.error(
      `[payment-request/grow] createPaymentProcess failed contractId=${contractId}: ${linkResult.reason}`,
    );
    return NextResponse.json(
      { error: "שגיאה ביצירת קישור תשלום ב-Grow. נסה שנית." },
      { status: 502 },
    );
  }

  // ── Persist hosted URL + Grow process id/token ─────────────────────────────
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data:  {
      paymentUrl:        linkResult.paymentUrl,
      growProcessId:     linkResult.processId || null,
      growProcessToken:  linkResult.processToken,
      providerPaymentId: linkResult.processId || null,
    },
  });

  // ── Advance Contract to PAYMENT_PENDING ────────────────────────────────────
  await prisma.contract.updateMany({
    where: { id: contractId, status: { in: ["SIGNED", "OPENED"] } },
    data:  { status: "PAYMENT_PENDING" },
  });

  await logAuditEvent({
    userId,
    action:     "contract.payment_request.created",
    entityType: "payment",
    entityId:   updated.id,
    metadata:   { provider: "grow", amount: clientAmount, feePaidBy: "BROKER", contractId },
    ip,
    userAgent,
  });

  // ── Send SMS / email with the Grow hosted URL (same helpers as Stripe/Rapyd) ─
  const notifyContract = {
    id:              contractId,
    userId,
    clientId:        contract.client.id,
    propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
    client:          contract.client,
  };
  const notifyPayment = { id: updated.id, paymentUrl: updated.paymentUrl };

  await sendPaymentLinkSms(notifyContract, notifyPayment, user.fullName);
  after(async () => {
    await sendPaymentLinkEmail(notifyContract, notifyPayment, user.fullName, clientAmount);
  });

  return NextResponse.json(updated, { status: 201 });
}

// ── Helper: auto-send payment link email (never throws) ──────────────────────
// Skipped silently when client has no email address.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendPaymentLinkEmail(
  contract: {
    id:              string;
    userId:          string;
    clientId:        string;
    propertyAddress: string;
    client:          { name: string; email: string };
  },
  payment:      { id: string; paymentUrl: string | null },
  brokerName:   string,
  amountAgorot: number,
): Promise<void> {
  try {
    if (!payment.paymentUrl) return;
    if (!contract.client.email.trim()) {
      console.log(`[sendPaymentLinkEmail] skipped — contract ${contract.id} has no client email`);
      return;
    }

    // The email template expects NIS (full currency units). Every caller passes the
    // amount in agorot, so convert exactly once here. This is the fix for the 100×
    // display bug (₪11,000 was rendering as ₪1,100,000 because agorot reached the
    // NIS-typed template field unconverted).
    const template = paymentRequestEmail({
      clientName:      contract.client.name,
      brokerName,
      propertyAddress: contract.propertyAddress,
      amountNis:       amountAgorot / 100,
      paymentLink:     payment.paymentUrl,
    });

    // Create PENDING record before the network call.
    const message = await prisma.message.create({
      data: {
        type:           "PAYMENT_REQUEST_LINK",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        contractId:     contract.id,
        clientId:       contract.clientId,
        paymentId:      payment.id,
        userId:         contract.userId,
        recipientEmail: contract.client.email.trim(),
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({ to: contract.client.email.trim(), ...template });

    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? {
            status:            "SENT",
            providerMessageId: result.messageId ?? null,
            attempts:          1,
            lastAttemptAt:     new Date(),
          }
        : {
            status:        "FAILED",
            failureReason: result.reason,
            attempts:      1,
            lastAttemptAt: new Date(),
          },
    });

    if (!result.ok) {
      console.error(`[sendPaymentLinkEmail] email failed for contract ${contract.id}:`, result.reason);
    }
  } catch (err) {
    // Must never propagate — the payment request is already created.
    console.error("[sendPaymentLinkEmail] unexpected error:", err);
  }
}
