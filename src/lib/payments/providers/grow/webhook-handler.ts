/**
 * src/lib/payments/providers/grow/webhook-handler.ts — P3b orchestration.
 *
 * Flow: parse callback (trigger only) → locate Payment (cField1, fallback
 * paymentLinkProcessId) → idempotency short-circuit (already PAID) → VERIFY-THEN-
 * TRUST via getPaymentLinkInfo (authoritative) → cross-check → atomic PAID +
 * Contract PAID → audit → broker email + best-effort ApproveTransaction (after()).
 *
 * The callback is ONLY a trigger; every PAID-decision value comes from the
 * getPaymentLinkInfo re-fetch. Returns 200 for terminal outcomes, 5xx only for
 * our transient errors (so Grow retries). Logs ids/outcomes only — no secrets/PII.
 */

import { after } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { sendEmail, paymentReceivedEmail } from "@/lib/email";
import { parsePropertyAddress } from "@/lib/format-address";
import { parseCallbackBody, sanitizeForCapture } from "./webhook-capture";
import { extractCallbackTrigger, findPaidTransaction } from "./webhook-parse";
import { getGrowPaymentLinkInfo } from "./getPaymentLinkInfo.http";
import { approveGrowTransaction } from "./approveTransaction.http";

export interface CallbackResult {
  httpStatus: number;
  outcome: string;
}

const PROVIDER = "grow_payment";

const paymentSelect = {
  id: true,
  status: true,
  provider: true,
  contractId: true,
  grossAmount: true,
  growProcessId: true,
  growProcessToken: true,
  contract: { select: { userId: true } },
} as const;

export async function processGrowPaymentCallback(input: {
  rawText: string;
  contentType: string | null;
  sourceIp: string | null;
}): Promise<CallbackResult> {
  const { rawText, contentType } = input;
  const { kind, data } = parseCallbackBody(rawText, contentType);
  const form = data ?? {};
  const trigger = extractCallbackTrigger(form);

  // eventId: stable transactionId where available, else a body hash.
  const eventId = trigger.transactionId ?? createHash("sha256").update(rawText).digest("hex");

  // ── Locate the Payment (cField1 primary, paymentLinkProcessId fallback) ──
  let payment = trigger.cField1
    ? await prisma.payment.findUnique({ where: { id: trigger.cField1 }, select: paymentSelect })
    : null;
  if (!payment && trigger.paymentLinkProcessId) {
    payment = await prisma.payment.findFirst({
      where: { growProcessId: trigger.paymentLinkProcessId, provider: "grow" },
      select: paymentSelect,
    });
  }

  // Always store a sanitized capture/audit row (also the dedup record).
  await storeEvent(eventId, { contentType, kind, callback: sanitizeForCapture(form) });

  if (!payment) return finalize(eventId, "IGNORED", 200, "uncorrelated");
  if (payment.provider !== "grow") return finalize(eventId, "IGNORED", 200, "not_grow");

  // ── Idempotency: already PAID → no-op (skip the re-fetch entirely) ──
  if (payment.status === "PAID") return finalize(eventId, "IGNORED", 200, "already_paid");

  if (!payment.growProcessId || !payment.growProcessToken) {
    return finalize(eventId, "FAILED", 200, "missing_link_handles");
  }

  const merchant = await prisma.growBrokerMerchant.findUnique({
    where: { userId: payment.contract.userId },
    select: { id: true, growUserId: true },
  });
  if (!merchant?.growUserId) return finalize(eventId, "FAILED", 200, "no_merchant");

  // ── VERIFY-THEN-TRUST: authoritative re-fetch (independent of the callback) ──
  const info = await getGrowPaymentLinkInfo({
    merchantId: merchant.id,
    growUserId: merchant.growUserId,
    paymentLinkProcessId: payment.growProcessId,
    paymentLinkProcessToken: payment.growProcessToken,
  });
  if (!info.ok) {
    // Transient/Grow error → 5xx so Grow retries; Payment stays PENDING.
    await setEventStatus(eventId, "FAILED", `getPaymentLinkInfo: ${info.reason}`);
    console.error(`[grow/webhook] verify error paymentId=${payment.id}: ${info.reason}`);
    return { httpStatus: 500, outcome: "verify_error" };
  }

  const txn = findPaidTransaction(info.data, payment.id);
  if (!txn) {
    // Authoritative source shows no PAID transaction → conservative: leave PENDING.
    console.log(`[grow/webhook] no paid txn per getPaymentLinkInfo paymentId=${payment.id}`);
    return finalize(eventId, "IGNORED", 200, "not_paid_authoritative");
  }

  // ── Cross-checks against the AUTHORITATIVE re-fetch ──
  const amountOk = txn.sumShekels != null && Math.round(Number(txn.sumShekels) * 100) === payment.grossAmount;
  const cFieldOk = txn.cField1 === payment.id;
  const linkOk = txn.paymentLinkProcessId === payment.growProcessId;
  if (!amountOk || !cFieldOk || !linkOk) {
    console.error(
      `[grow/webhook] verification mismatch paymentId=${payment.id} amountOk=${amountOk} cFieldOk=${cFieldOk} linkOk=${linkOk}`,
    );
    return finalize(eventId, "FAILED", 200, "verification_mismatch");
  }

  // ── Mark PAID (atomic, status-guarded → idempotent) + Contract PAID ──
  const paidAt = new Date();
  const growRaw = safeStringify(sanitizeForCapture(info.data));
  const transitioned = await prisma.$transaction(async (tx) => {
    const upd = await tx.payment.updateMany({
      where: { id: payment!.id, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt,
        growTransactionId: txn.transactionId,
        growTransactionToken: txn.transactionToken,
        growAsmachta: txn.asmachta,
        growRaw,
        cardLast4: txn.cardSuffix,
        settlementStatus: "SETTLED",
        // NOTE: growProcessId left untouched (it holds paymentLinkProcessId).
      },
    });
    if (upd.count === 0) return false; // lost a race → already PAID
    await tx.contract.updateMany({
      where: { id: payment!.contractId, status: { in: ["PAYMENT_PENDING", "SIGNED", "OPENED"] } },
      data: { status: "PAID" },
    });
    return true;
  });

  if (!transitioned) return finalize(eventId, "IGNORED", 200, "already_paid_race");

  await logAuditEvent({
    userId: null, // system webhook
    action: "contract.payment.paid",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      provider: "grow",
      contractId: payment.contractId,
      transactionId: txn.transactionId,
      asmachta: txn.asmachta,
      source: "getPaymentLinkInfo",
    },
    ip: input.sourceIp,
  });

  const contractId = payment.contractId;
  const paymentId = payment.id;
  const merchantId = merchant.id;
  const growUserId = merchant.growUserId;
  after(async () => {
    await sendBrokerPaidEmail(contractId, paymentId, paidAt);
  });
  after(async () => {
    await approveGrowTransaction({
      merchantId,
      growUserId,
      processId: txn.processId,
      processToken: txn.processToken,
      transactionId: txn.transactionId,
    });
  });

  console.log(
    `[grow/webhook] ✓ paymentId=${paymentId} → PAID transactionId=${txn.transactionId} contractId=${contractId}`,
  );
  return finalize(eventId, "PROCESSED", 200, "paid");
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function storeEvent(eventId: string, payload: object): Promise<void> {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: PROVIDER,
        eventId,
        eventType: "createpaymentlink_callback",
        payload: safeJson(payload),
        status: "RECEIVED",
      },
    });
  } catch (err) {
    // Duplicate (Grow retry) → row already exists; idempotency is enforced by the
    // Payment status guard, so just continue. Log other DB errors only.
    const dup = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    if (!dup) console.error("[grow/webhook] WebhookEvent.create failed:", errMsg(err));
  }
}

async function setEventStatus(
  eventId: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  error?: string,
): Promise<void> {
  try {
    await prisma.webhookEvent.updateMany({
      where: { provider: PROVIDER, eventId },
      data: { status, error: error ?? null },
    });
  } catch {
    /* non-fatal */
  }
}

async function finalize(
  eventId: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  httpStatus: number,
  outcome: string,
): Promise<CallbackResult> {
  await setEventStatus(eventId, status);
  return { httpStatus, outcome };
}

// Mirrors /api/stripe/payment/webhook sendBrokerPaidEmail — never throws.
async function sendBrokerPaidEmail(contractId: string, paymentId: string, paidAt: Date): Promise<void> {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { client: true, user: true, payment: true },
    });
    if (!contract) return;
    const brokerEmail = contract.user.email?.trim() ?? "";
    if (!brokerEmail) return;

    const amountAgorot = contract.payment?.grossAmount ?? contract.commission;
    const amountNis = Math.round(amountAgorot / 100);
    const baseUrl = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const receivedAtFormatted = paidAt.toLocaleDateString("he-IL", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const template = paymentReceivedEmail({
      brokerName: contract.user.fullName,
      clientName: contract.client.name,
      propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
      amountNis,
      contractId,
      receivedAt: receivedAtFormatted,
      dashboardUrl: `${baseUrl}/contracts/${contractId}`,
    });

    const message = await prisma.message.create({
      data: {
        type: "BROKER_PAYMENT_RECEIVED",
        channel: "EMAIL",
        provider: "resend",
        subject: template.subject,
        body: template.text,
        contractId,
        clientId: contract.clientId,
        paymentId,
        userId: contract.userId,
        recipientEmail: brokerEmail,
        status: "PENDING",
        attempts: 0,
      },
    });
    const result = await sendEmail({ to: brokerEmail, ...template, emailType: "payment_received" });
    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? { status: "SENT", providerMessageId: result.messageId ?? null, attempts: 1, lastAttemptAt: new Date() }
        : { status: "FAILED", failureReason: result.reason, attempts: 1, lastAttemptAt: new Date() },
    });
  } catch (err) {
    console.error("[grow/webhook sendBrokerPaidEmail] unexpected:", errMsg(err));
  }
}

function safeJson(o: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue;
}
function safeStringify(o: unknown): string {
  try {
    return JSON.stringify(o);
  } catch {
    return "[unserializable]";
  }
}
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
