import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { auth }  from "@/lib/auth";
import { sendSms, getSmsProviderName } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { rateLimit, getRealIp } from "@/lib/rate-limit";
import { sendEmail, contractSignedEmail } from "@/lib/email";
import { parsePropertyAddress } from "@/lib/format-address";

// ── UUID format guard — reject obviously invalid tokens before hitting the DB ─
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET /api/contracts/sign/[token] ──────────────────────────────────────────
// Public endpoint — returns signing-safe contract fields for the client.
// Does NOT expose userId, signatureToken, signatureHash, userAgent, or any
// broker-private metadata.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
    }

    const contract = await prisma.contract.findUnique({
      where:   { signatureToken: token },
      include: { client: true, payment: true },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // ── OPENED transition ─────────────────────────────────────────────────────
    // Advance SENT → OPENED the first time the client opens the link.
    // updateMany silently no-ops when count=0, so repeated refreshes are safe.
    // Errors are swallowed so a DB hiccup never breaks the signing-page response.
    if (contract.status === "SENT") {
      await prisma.contract.updateMany({
        where: { id: contract.id, status: "SENT" },
        data:  { status: "OPENED" },
      }).catch((err) => console.error("[sign GET] OPENED transition failed:", err));
    }

    // ── Return only fields required to render + sign the contract ─────────────
    // Deliberately omitted (audit/broker-private):
    //   signatureHash — tamper-detection only; client has no use for it
    //   userAgent     — recorded on sign, never sent back
    //   templateId    — internal DB FK; not needed by signing page
    //   signatureIp   — audit field stored server-side only
    //   signatureToken, userId — always excluded
    return NextResponse.json({
      id:              contract.id,
      contractType:    contract.contractType,
      dealType:        contract.dealType,
      status:          contract.status,
      propertyAddress: contract.propertyAddress,
      propertyCity:    contract.propertyCity,
      propertyPrice:   contract.propertyPrice,
      commission:      contract.commission,
      dealClosed:      contract.dealClosed,
      sentAt:          contract.sentAt?.toISOString()       ?? null,
      signedAt:        contract.signedAt?.toISOString()     ?? null,
      dealClosedAt:    contract.dealClosedAt?.toISOString() ?? null,
      createdAt:       contract.createdAt.toISOString(),
      client: {
        name:     contract.client.name,
        phone:    contract.client.phone,
        email:    contract.client.email,
        idNumber: contract.client.idNumber,
      },
      payment: contract.payment ? {
        status:     contract.payment.status,
        paidAt:     contract.payment.paidAt?.toISOString() ?? null,
        paymentUrl: contract.payment.paymentUrl ?? null,
        provider:   contract.payment.provider   ?? null,
      } : null,
      signatureData:             contract.signatureData ?? null,
      propertyId:                contract.propertyId    ?? null,
      hideFullAddressFromClient: contract.hideFullAddressFromClient,
      generatedText:             contract.generatedText ?? null,
      language:                  contract.language      ?? "HE",
    });
  } catch (error) {
    console.error("[GET /api/contracts/sign/:token]", error);
    return NextResponse.json({ error: "שגיאה בטעינת החוזה" }, { status: 500 });
  }
}

// ── Broker notification — fire-and-forget ────────────────────────────────────
// Notifies the broker by SMS when their client signs. Never throws or blocks.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendBrokerSignedSms(
  contract: { id: string; userId: string; clientId: string; propertyAddress: string },
  clientName: string,
): Promise<void> {
  try {
    const broker = await prisma.user.findUnique({ where: { id: contract.userId } });
    if (!broker?.phone) return;

    const testPhone       = process.env.SMS_TEST_PHONE?.trim() || "";
    const normalizedPhone = normalizeIsraeliPhone(broker.phone);
    const normalizedTest  = testPhone ? normalizeIsraeliPhone(testPhone) : "";

    const baseUrl      = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const contractLink = `${baseUrl}/contracts/${contract.id}`;

    const body =
      `${clientName} חתם/ה על החוזה עבור:\n` +
      `${contract.propertyAddress}\n\n` +
      `לצפייה בחוזה:\n` +
      `${contractLink}\n\n` +
      `SignDeal`;

    if (normalizedTest && normalizedPhone !== normalizedTest) {
      console.log(`[sendBrokerSignedSms] skipped — ${normalizedPhone} is not SMS_TEST_PHONE`);
      await prisma.message.create({
        data: {
          type:           "BROKER_CONTRACT_SIGNED",
          channel:        "SMS",
          provider:       getSmsProviderName(),
          body,
          contractId:     contract.id,
          clientId:       contract.clientId,
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
        type:           "BROKER_CONTRACT_SIGNED",
        channel:        "SMS",
        provider:       getSmsProviderName(),
        body,
        contractId:     contract.id,
        clientId:       contract.clientId,
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
        ? { status: "SENT", providerMessageId: result.messageId, attempts: 1, lastAttemptAt: new Date() }
        : { status: "FAILED", failureReason: result.reason, attempts: 1, lastAttemptAt: new Date() },
    });

    if (!result.ok) {
      console.error(`[sendBrokerSignedSms] SMS failed for contract ${contract.id}:`, result.reason);
    }
  } catch (err) {
    console.error("[sendBrokerSignedSms] unexpected error:", err);
  }
}

// ── Email notification — fire-and-forget ─────────────────────────────────────
// Sends the broker a "contract signed" confirmation email.
// Skipped silently when broker has no email address.

async function sendBrokerSignedEmail(
  contract: { id: string; userId: string; clientId: string; propertyAddress: string },
  clientName: string,
  signedAt:   Date,
): Promise<void> {
  try {
    const broker = await prisma.user.findUnique({
      where:  { id: contract.userId },
      select: { email: true, fullName: true },
    });
    if (!broker?.email) {
      console.log(`[sendBrokerSignedEmail] skipped — broker for contract ${contract.id} has no email`);
      return;
    }

    const baseUrl      = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const dashboardUrl = `${baseUrl}/contracts/${contract.id}`;

    const signedAtFormatted = signedAt.toLocaleDateString("he-IL", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const template = contractSignedEmail({
      brokerName:      broker.fullName,
      clientName,
      propertyAddress: contract.propertyAddress,
      contractId:      contract.id,
      signedAt:        signedAtFormatted,
      dashboardUrl,
    });

    // Create PENDING record before the network call.
    const message = await prisma.message.create({
      data: {
        type:           "BROKER_CONTRACT_SIGNED",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        contractId:     contract.id,
        clientId:       contract.clientId,
        userId:         contract.userId,
        recipientEmail: broker.email,
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({ to: broker.email, ...template });

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
      console.error(`[sendBrokerSignedEmail] email failed for contract ${contract.id}:`, result.reason);
    }
  } catch (err) {
    // Must never propagate — the contract is already signed.
    console.error("[sendBrokerSignedEmail] unexpected error:", err);
  }
}

// ── PATCH /api/contracts/sign/[token] ─────────────────────────────────────────
// Public endpoint — only permits client info updates and signing.
// Broker-only operations (dealClosed, status overrides, etc.) are rejected.

const SIGNING_ALLOWED_FIELDS = new Set([
  "signatureStatus", "signedAt",
  "clientEmail", "clientIdNumber",
  "signatureData", "signatureHash",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
    }

    // ── Rate limit: max 10 signing attempts per token per 15 minutes ──────────
    // Keyed on token so it prevents brute-force enumeration of signing tokens.
    // Also keyed on IP to catch clients with multiple tokens.
    const ip = getRealIp(request);
    const rlToken = rateLimit(token, "sign-patch",  { max: 10, windowMs: 15 * 60_000 });
    const rlIp    = rateLimit(ip,    "sign-patch-ip", { max: 30, windowMs: 15 * 60_000 });
    if (!rlToken.allowed || !rlIp.allowed) {
      const retryAfter = Math.max(rlToken.retryAfter ?? 0, rlIp.retryAfter ?? 0);
      return NextResponse.json(
        { error: "יותר מדי ניסיונות — נסה שוב מאוחר יותר" },
        {
          status:  429,
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }

    const body = await request.json();

    // Reject any field that isn't in the signing-safe allowlist
    const disallowed = Object.keys(body).filter(k => !SIGNING_ALLOWED_FIELDS.has(k));
    if (disallowed.length > 0) {
      return NextResponse.json({ error: "Operation not permitted" }, { status: 403 });
    }

    const { signatureStatus, signedAt, clientEmail, clientIdNumber, signatureData, signatureHash } = body;

    if (signatureData !== undefined && typeof signatureData === "string" && signatureData.length > 500_000) {
      return NextResponse.json({ error: "Signature data too large" }, { status: 400 });
    }

    // ── signatureStatus: only "SIGNED" is a valid client-facing transition ────
    if (signatureStatus !== undefined && signatureStatus !== "SIGNED") {
      return NextResponse.json(
        { error: "ערך סטטוס לא חוקי — ניתן לשלוח SIGNED בלבד" },
        { status: 400 },
      );
    }

    const contract = await prisma.contract.findUnique({
      where: { signatureToken: token },
    });

    if (!contract) {
      return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
    }
    if (contract.status === "CANCELED") {
      return NextResponse.json({ error: "החוזה בוטל ואינו ניתן לחתימה" }, { status: 409 });
    }
    if (contract.status === "EXPIRED") {
      return NextResponse.json({ error: "תוקף החוזה פג" }, { status: 409 });
    }
    if (signatureStatus === "SIGNED" && contract.status === "SIGNED") {
      return NextResponse.json({ error: "החוזה כבר נחתם" }, { status: 409 });
    }

    // ── Owner guard (defence-in-depth) ────────────────────────────────────────
    // The signing page already renders in read-only preview mode for the broker,
    // so this path should never be reached in normal use.  It exists to reject
    // any direct API call where the authenticated session user is the contract
    // owner — preventing self-signing regardless of how the request originated.
    const session = await auth();
    if (session?.user?.id && session.user.id === contract.userId) {
      return NextResponse.json(
        { error: "בעל החוזה אינו יכול לחתום על החוזה בשם הלקוח" },
        { status: 403 },
      );
    }

    const data: Record<string, unknown> = {};

    // Client info fields
    const clientData: Record<string, string> = {};
    if (clientEmail    !== undefined) clientData.email    = clientEmail;
    if (clientIdNumber !== undefined) clientData.idNumber = clientIdNumber;
    if (Object.keys(clientData).length > 0) data.client = { update: clientData };

    // Signing
    if (signatureStatus === "SIGNED") {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
               ?? request.headers.get("x-real-ip")
               ?? null;
      const ua = request.headers.get("user-agent") ?? null;

      data.status      = "SIGNED";
      data.signedAt    = new Date(); // server controls timestamp; client-supplied signedAt is ignored
      data.signatureIp = ip;
      data.userAgent   = ua;
      if (typeof signatureData === "string") data.signatureData = signatureData;
      if (typeof signatureHash === "string") data.signatureHash = signatureHash;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.contract.update({
      where:   { signatureToken: token },
      data,
      include: { client: true, payment: true },
    });

    // G3.3: Persist audit activity + G3.4: notify broker — only on signing.
    // The activity message embeds the hash prefix (first 12 chars) and whether
    // an IP was captured, forming a durable audit trail without exposing full
    // secrets. The full signatureHash, signatureIp, and userAgent are stored
    // on the Contract record itself.
    // sendBrokerSignedSms is awaited so Vercel does not kill the promise.
    if (signatureStatus === "SIGNED") {
      const hashPrefix   = typeof signatureHash === "string" && signatureHash
        ? signatureHash.slice(0, 12)
        : null;
      const ipCaptured   = !!(data.signatureIp);

      const auditMessage = [
        "הלקוח חתם על החוזה",
        hashPrefix  ? `גיבוב: ${hashPrefix}…` : null,
        ipCaptured  ? "IP נרשם"              : "IP לא זמין",
        (data.signatureData as string | undefined) ? "חתימה גרפית נשמרה" : null,
      ].filter(Boolean).join(" | ");

      await prisma.activity.create({
        data: {
          contractId: contract.id,
          message:    auditMessage,
          userId:     contract.userId,
        },
      });
      const signingContext = {
        id:              contract.id,
        userId:          contract.userId,
        clientId:        contract.clientId,
        // Decode the stored "street||floor||apt" format — notifications only
        // need the human-readable address portion.
        propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
      };

      // Both broker notifications run AFTER the signing response is flushed so
      // the client sees their confirmation screen instantly.  after() keeps the
      // Vercel function alive until the callback resolves.
      // TODO(queue): Replace with a durable job queue (BullMQ / Inngest) once
      //   message volume or retry requirements outgrow fire-and-forget.
      after(async () => {
        await sendBrokerSignedSms(signingContext, updated.client.name);
        await sendBrokerSignedEmail(
          signingContext,
          updated.client.name,
          updated.signedAt ?? new Date(),
        );
      });
    }

    // G3.1: Return only signing-safe fields — no signatureToken, userId, signatureIp
    return NextResponse.json({
      id:            updated.id,
      contractType:  updated.contractType,
      status:        updated.status,
      signedAt:      updated.signedAt?.toISOString()     ?? null,
      signatureData: updated.signatureData               ?? null,
      signatureHash: updated.signatureHash               ?? null,
      client: {
        name:     updated.client.name,
        phone:    updated.client.phone,
        email:    updated.client.email,
        idNumber: updated.client.idNumber,
      },
      payment: updated.payment ? {
        status:     updated.payment.status,
        paidAt:     updated.payment.paidAt?.toISOString() ?? null,
        paymentUrl: updated.payment.paymentUrl             ?? null,
        provider:   updated.payment.provider               ?? null,
      } : null,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }
    console.error("[PATCH /api/contracts/sign/:token]", error);
    return NextResponse.json({ error: "שגיאה בשמירת החתימה — נסה שוב" }, { status: 500 });
  }
}
