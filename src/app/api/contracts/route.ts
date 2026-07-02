import { randomUUID } from "crypto";
import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms, getSmsProviderName } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { requireUserId } from "@/lib/require-user";
import { canCreateContract } from "@/lib/subscription";
import { resolveTemplate, buildContext } from "@/lib/contracts/resolve-template";
import { CONTRACT_TYPE } from "@/lib/contracts/contract-types";
import { rateLimit, getRealIp } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { parsePositiveInt, parseNonNegativeInt, parseEnum, parseOptionalEnum, parseOptionalPositiveFloat, firstError } from "@/lib/validate";
import { sendEmail, contractSigningEmail } from "@/lib/email";
import { parsePropertyAddress } from "@/lib/format-address";

// ─── SMS helper ───────────────────────────────────────────────────────────────
// Fire-and-forget: never throws, never blocks the HTTP response.
// All outcomes (SENT, FAILED, CANCELED) are persisted as Message records.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendContractSms(
  contract: {
    id: string;
    signatureToken: string;
    propertyAddress: string;
    userId: string;
    clientId: string;
  },
  clientPhone: string,
  clientName: string,
  brokerName: string,
): Promise<void> {
  try {
    const baseUrl = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const testPhone = process.env.SMS_TEST_PHONE?.trim() || "";
    const signingLink = `${baseUrl}/contracts/sign/${contract.signatureToken}`;
    const normalizedPhone = normalizeIsraeliPhone(clientPhone);

    const body =
      `שלום ${clientName},\n` +
      `נשלח אליך חוזה לחתימה מ-${brokerName} דרך SignDeal.\n\n` +
      `לחתימה על החוזה:\n` +
      `${signingLink}\n\n` +
      `אם יש שאלות ניתן ליצור קשר עם המתווך ישירות.`;

    // Safety guard: compare normalized forms so the guard works regardless of
    // how the phone was typed in the wizard vs how SMS_TEST_PHONE is set in .env.
    const normalizedTest = testPhone ? normalizeIsraeliPhone(testPhone) : "";
    if (normalizedTest && normalizedPhone !== normalizedTest) {
      console.log(
        `[sendContractSms] skipped — ${normalizedPhone} is not SMS_TEST_PHONE`,
      );
      await prisma.message.create({
        data: {
          type: "CONTRACT_SIGNING_LINK",
          channel: "SMS",
          provider: getSmsProviderName(),
          body,
          contractId: contract.id,
          clientId: contract.clientId,
          userId: contract.userId,
          recipientPhone: normalizedPhone,
          status: "CANCELED",
          failureReason: "skipped: phone does not match SMS_TEST_PHONE",
          attempts: 0,
        },
      });
      return;
    }

    // Create PENDING record before the network call so a crash mid-flight
    // still leaves an auditable record.
    const message = await prisma.message.create({
      data: {
        type: "CONTRACT_SIGNING_LINK",
        channel: "SMS",
        provider: getSmsProviderName(),
        body,
        contractId: contract.id,
        clientId: contract.clientId,
        userId: contract.userId,
        recipientPhone: normalizedPhone,
        status: "PENDING",
        attempts: 0,
      },
    });

    const result = await sendSms({ to: normalizedPhone, body });

    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? {
          status: "SENT",
          providerMessageId: result.messageId,
          attempts: 1,
          lastAttemptAt: new Date(),
        }
        : {
          status: "FAILED",
          failureReason: result.reason,
          attempts: 1,
          lastAttemptAt: new Date(),
        },
    });

    if (!result.ok) {
      console.error(
        `[sendContractSms] SMS failed for contract ${contract.id}:`,
        result.reason,
      );
    }
  } catch (err) {
    // Must never propagate — the contract was already created successfully.
    console.error("[sendContractSms] unexpected error:", err);
  }
}

// ─── Email helper ─────────────────────────────────────────────────────────────
// Fire-and-forget: never throws, never blocks the HTTP response.
// Skipped silently when client has no email address.
// TODO(queue): Replace after() + inline send with a durable job queue (BullMQ /
//   Inngest) once retry-on-failure or delivery guarantees are required.

async function sendContractEmail(
  contract: {
    id: string;
    signatureToken: string;
    propertyAddress: string;
    userId: string;
    clientId: string;
  },
  clientEmail: string,
  clientName: string,
  brokerName: string,
): Promise<void> {
  try {
    if (!clientEmail.trim()) {
      console.log(`[sendContractEmail] skipped — contract ${contract.id} has no client email`);
      return;
    }

    const baseUrl = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const signingLink = `${baseUrl}/contracts/sign/${contract.signatureToken}`;

    const template = contractSigningEmail({
      clientName,
      brokerName,
      propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
      signingLink,
    });

    // Create PENDING record before the network call so a crash mid-flight
    // still leaves an auditable record.
    const message = await prisma.message.create({
      data: {
        type: "CONTRACT_SIGNING_LINK",
        channel: "EMAIL",
        provider: "resend",
        subject: template.subject,
        body: template.text,
        contractId: contract.id,
        clientId: contract.clientId,
        userId: contract.userId,
        recipientEmail: clientEmail.trim(),
        status: "PENDING",
        attempts: 0,
      },
    });

    const result = await sendEmail({ to: clientEmail.trim(), ...template });

    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? {
          status: "SENT",
          providerMessageId: result.messageId ?? null,
          attempts: 1,
          lastAttemptAt: new Date(),
        }
        : {
          status: "FAILED",
          failureReason: result.reason,
          attempts: 1,
          lastAttemptAt: new Date(),
        },
    });

    if (!result.ok) {
      console.error(
        `[sendContractEmail] email failed for contract ${contract.id}:`,
        result.reason,
      );
    }
  } catch (err) {
    // Must never propagate — the contract was already created successfully.
    console.error("[sendContractEmail] unexpected error:", err);
  }
}

// ─── GET /api/contracts ───────────────────────────────────────────────────────

export async function GET() {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const contracts = await prisma.contract.findMany({
      where: { userId },
      include: { client: true, payment: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(contracts);
  } catch (error) {
    console.error("[GET /api/contracts]", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}

// ─── POST /api/contracts ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const authResult = await requireUserId();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // ── Rate limit: 20 contract creations per broker per hour ─────────────────
    // Keyed on userId (not IP) — brokers may share office NAT.
    // Each creation sends an SMS and may call an external template; 20/hr is
    // well above normal usage for a single broker.
    const rl = await rateLimit(userId, "contract-create", { max: 20, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי חוזים — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ── Subscription enforcement ───────────────────────────────────────────────
    // Checked after auth + rate-limit (both cheaper) and before body parsing.
    // canCreateContract() fetches subscription + monthly doc count in at most 2
    // queries; short-circuits after 1 when subscription is inactive.
    // Emits reason: "SUBSCRIPTION_INACTIVE" | "MONTHLY_LIMIT_REACHED"
    const usageCheck = await canCreateContract(userId);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: usageCheck.reason },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      contractType,
      dealType,
      propertyAddress,
      propertyCity,
      propertyPrice,
      commission,
      commissionSale,      // only expected when dealType === "BOTH"
      clientName,
      clientPhone,
      clientEmail,
      clientIdNumber,
      propertyId,
      existingClientDbId,
      hideFullAddressFromClient,
      rentalCommissionMode,   // "ONE_MONTH" | "FIXED" — only meaningful for the rental interested flow
      saleCommissionMode,     // "PERCENT" | "FIXED"   — only meaningful for the sale interested flow
      saleCommissionPercent,  // human percent (2, 1.5) — only when saleCommissionMode = "PERCENT"
      language: rawLanguage,
    } = body;

    // Validate language — default HE, fallback to HE for any unknown value
    const VALID_LANGS = new Set(["HE", "EN", "FR", "RU", "AR"]);
    const language = typeof rawLanguage === "string" && VALID_LANGS.has(rawLanguage.toUpperCase())
      ? rawLanguage.toUpperCase()
      : "HE";

    // ── Required string fields ────────────────────────────────────────────────
    if (!contractType || !propertyAddress || !propertyCity) {
      return NextResponse.json({ error: "Missing required contract fields" }, { status: 400 });
    }
    if (!clientName || !clientPhone) {
      return NextResponse.json({ error: "Missing required client fields" }, { status: 400 });
    }

    // ── Numeric + enum validation ─────────────────────────────────────────────
    const vDealType = parseEnum(dealType, ["SALE", "RENTAL", "BOTH"] as const, "סוג העסקה");
    const vPropertyPrice = parsePositiveInt(propertyPrice, "מחיר הנכס");
    const vCommission = parseNonNegativeInt(commission, "עמלה");
    // Optional: how the rental fee was chosen. Only persisted for the rental
    // interested template (see resolvedRentalMode below); null for everything else.
    const vRentalMode = parseOptionalEnum(rentalCommissionMode, ["ONE_MONTH", "FIXED"] as const, "אופן דמי התיווך");
    // Optional: how the sale fee was chosen (+ its percent). Only persisted for
    // the sale interested template (see resolvedSaleMode below).
    const vSaleMode = parseOptionalEnum(saleCommissionMode, ["PERCENT", "FIXED"] as const, "אופן עמלת מכירה");
    const vSalePct  = parseOptionalPositiveFloat(saleCommissionPercent, "אחוז עמלת מכירה", 100);
    const validationError = firstError(vDealType, vPropertyPrice, vCommission, vRentalMode, vSaleMode, vSalePct);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    // Narrowing: all Results are Ok beyond this point (firstError returned early on any Err)
    if (!vDealType.ok || !vPropertyPrice.ok || !vCommission.ok || !vRentalMode.ok || !vSaleMode.ok || !vSalePct.ok) {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }
    const validatedDealType = vDealType.value;
    const validatedPropertyPrice = vPropertyPrice.value;
    const validatedCommission = vCommission.value;

    // ── BOTH deal type: validate commissionSale (sale-side commission) ────────
    // SALE and RENTAL contracts must NOT include commissionSale.
    // BOTH contracts must include a non-negative integer for the sale commission.
    let validatedCommissionSale: number | null = null;
    if (validatedDealType === "BOTH") {
      const vCommissionSale = parseNonNegativeInt(commissionSale, "עמלת מכירה");
      if (!vCommissionSale.ok) {
        return NextResponse.json({ error: vCommissionSale.error }, { status: 400 });
      }
      validatedCommissionSale = vCommissionSale.value;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ── Client resolution ─────────────────────────────────────────────────────
    // Two paths:
    //   A. existingClientDbId provided → broker explicitly selected a known client
    //      from the picker; use that record exactly (ownership-checked).
    //   B. No existingClientDbId → broker typed the client manually; ALWAYS create
    //      a new Client record from the form body.
    //
    // ⚠ IMPORTANT: path B used to do findFirst({ phone }) (find-or-create).
    // That caused a critical identity bug: if "אופיר מלכה" existed in the DB
    // with the same phone the broker typed for "גפן בראון", the server silently
    // linked the new contract to "אופיר מלכה" and the generated document showed
    // the wrong name/phone/idNumber.  Since Client.phone has no unique constraint,
    // always-create is safe and is now the only correct behaviour for path B.
    let client;
    if (existingClientDbId) {
      // Path A — ownership check: broker may only link their own clients.
      // findFirst with both id and userId prevents IDOR.
      const found = await prisma.client.findFirst({
        where: { id: existingClientDbId, userId },
      });
      if (!found) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      client = found;
    } else {
      // Path B — always create; never deduplicate by phone.
      client = await prisma.client.create({
        data: {
          name: clientName,
          phone: clientPhone,
          // email/idNumber are non-nullable String in schema — use "" not null
          email: clientEmail?.trim() || "",
          idNumber: clientIdNumber?.trim() || "",
          // Use Prisma relation connect instead of scalar userId to satisfy v7 validation
          user: { connect: { id: user.id } },
        },
      });
    }

    // Auto-resolve template snapshot by contract type (+ deal type).
    // generatedText is frozen at creation time — subsequent edits to the template
    // never affect contracts that have already been sent.
    //
    // Resolution is layered so a single user-facing category ("החתמת מתעניין") can
    // map to different templates per dealType. A deal-type-specific override wins;
    // otherwise the category default applies. Extend TEMPLATE_KEY_BY_TYPE_AND_DEAL
    // as INTERESTED_BUYER_SALE / _BOTH (and future categories) are added.
    const CONTRACT_TYPE_TO_TEMPLATE_KEY: Record<string, string> = {
      [CONTRACT_TYPE.INTERESTED]:      "INTERESTED_BUYER",
      [CONTRACT_TYPE.OWNER_EXCLUSIVE]: "OWNER_EXCLUSIVE",
      [CONTRACT_TYPE.BROKER_COOP]:     "BROKER_COOP",
    };
    const TEMPLATE_KEY_BY_TYPE_AND_DEAL: Record<string, Partial<Record<string, string>>> = {
      [CONTRACT_TYPE.INTERESTED]: {
        RENTAL: "INTERESTED_BUYER_RENTAL",
        SALE:   "INTERESTED_BUYER_SALE",
        // BOTH: "INTERESTED_BUYER_BOTH",   // future
      },
    };

    let generatedText: string | null = null;
    let resolvedTemplateId: string | null = null;

    const autoKey =
      TEMPLATE_KEY_BY_TYPE_AND_DEAL[contractType]?.[validatedDealType]
      ?? CONTRACT_TYPE_TO_TEMPLATE_KEY[contractType]
      ?? null;

    // Persist the rental commission mode ONLY for the rental interested template.
    // Absent mode on that template defaults to ONE_MONTH so clause 6.1 is deterministic.
    const resolvedRentalMode: "ONE_MONTH" | "FIXED" | null =
      autoKey === "INTERESTED_BUYER_RENTAL" ? (vRentalMode.value ?? "ONE_MONTH") : null;

    // Persist the sale commission mode + percent ONLY for the sale interested
    // template. Absent mode defaults to FIXED so clause 5.1 always states the
    // stored commission amount (truthful + deterministic across regeneration).
    const resolvedSaleMode: "PERCENT" | "FIXED" | null =
      autoKey === "INTERESTED_BUYER_SALE" ? (vSaleMode.value ?? "FIXED") : null;
    const resolvedSalePercent: number | null =
      resolvedSaleMode === "PERCENT" ? vSalePct.value : null;
    if (resolvedSaleMode === "PERCENT" && resolvedSalePercent == null) {
      return NextResponse.json({ error: "יש להזין אחוז עמלה" }, { status: 400 });
    }

    if (autoKey) {
      const templateKey = autoKey as "INTERESTED_BUYER" | "OWNER_EXCLUSIVE" | "BROKER_COOP" | "INTERESTED_BUYER_RENTAL" | "INTERESTED_BUYER_SALE";
      const templateLang = language as "HE" | "EN" | "FR" | "RU" | "AR";

      // Resolve by (templateKey + language), fallback to HE if not found
      const tpl =
        await prisma.contractTemplate.findFirst({
          where: { templateKey, language: templateLang, isActive: true },
        }) ??
        await prisma.contractTemplate.findFirst({
          where: { templateKey, language: "HE", isActive: true },
        });
      if (tpl) {
        const ctx = buildContext({
          broker: { fullName: user.fullName, licenseNumber: user.licenseNumber ?? null, phone: user.phone ?? null, idNumber: user.idNumber ?? null },
          // ── Fix: use the resolved client DB record, NOT the raw form-body values.
          // When existingClientDbId is provided the form body may contain stale or
          // different data from a previous wizard session; the DB record is always
          // canonical.  Using form-body values here was the root cause of the
          // client/broker identity mixing bug (phone/idNumber mismatch between the
          // client details card and the legal document).
          client: { name: client.name, idNumber: client.idNumber || "", phone: client.phone, email: client.email || "", address: client.address ?? null },
          contract: { id: "pending", propertyAddress, propertyCity, propertyPrice: validatedPropertyPrice, dealType: validatedDealType, commission: validatedCommission, commissionSale: validatedCommissionSale, rentalCommissionMode: resolvedRentalMode, saleCommissionMode: resolvedSaleMode, saleCommissionPercent: resolvedSalePercent, createdAt: new Date() },
        });
        generatedText = resolveTemplate(tpl.content, ctx);
        resolvedTemplateId = tpl.id;
      }
      // No active template for this type → graceful fallback (generatedText stays null)
    }

    const signatureToken = randomUUID();

    // ── Create contract + immutable usage event in one transaction ───────────
    // ContractUsageEvent is the authoritative monthly usage ledger.
    // Writing both atomically guarantees no contract can exist without a
    // corresponding usage event (crash-safe) and no event exists without a
    // contract (double-count safe).
    const contract = await prisma.$transaction(async (tx) => {
      const newContract = await tx.contract.create({
        data: {
          contractType,
          dealType: validatedDealType,
          propertyAddress,
          propertyCity,
          propertyPrice: validatedPropertyPrice,
          commission: validatedCommission,
          ...(validatedCommissionSale !== null ? { commissionSale: validatedCommissionSale } : {}),
          ...(resolvedRentalMode ? { rentalCommissionMode: resolvedRentalMode } : {}),
          ...(resolvedSaleMode ? { saleCommissionMode: resolvedSaleMode } : {}),
          ...(resolvedSalePercent != null ? { saleCommissionPercent: resolvedSalePercent } : {}),
          userId: user.id,
          clientId: client.id,
          signatureToken,
          status: "SENT",
          sentAt: new Date(),
          hideFullAddressFromClient: hideFullAddressFromClient === true,
          language,
          ...(propertyId ? { propertyId } : {}),
          ...(resolvedTemplateId ? { templateId: resolvedTemplateId } : {}),
          ...(generatedText ? { generatedText } : {}),
        },
        include: { client: true, payment: true },
      });

      // Write immutable usage slot.  Plan comes from canCreateContract() above —
      // no extra query needed.  Deleting this contract later will SET NULL on
      // contractId but keep this row, so the monthly count is unaffected.
      await tx.contractUsageEvent.create({
        data: {
          userId: user.id,
          contractId: newContract.id,
          plan: usageCheck.plan,
        },
      });

      return newContract;
    });

    // ── Audit log: contract created ───────────────────────────────────────────
    // Awaited inline — fast single INSERT, never throws (errors caught inside helper).
    await logAuditEvent({
      userId: userId,
      action: "contract.created",
      entityType: "contract",
      entityId: contract.id,
      metadata: { contractType, dealType: validatedDealType, language },
      ip: getRealIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    // Send signing-link SMS — awaited so Vercel doesn't kill the promise on response return.
    // sendContractSms catches all errors internally; failures never affect contract creation.
    // signatureToken is always set on newly created contracts (randomUUID above).
    await sendContractSms(
      { ...contract, signatureToken: contract.signatureToken! },
      client.phone,
      client.name,
      user.fullName,
    );

    // Send signing-link email after the response is flushed.
    // after() keeps the Vercel function alive until the callback resolves.
    // sendContractEmail catches all errors internally and skips silently when
    // the client has no email address.
    after(async () => {
      await sendContractEmail(
        { ...contract, signatureToken: contract.signatureToken! },
        client.email,
        client.name,
        user.fullName,
      );
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts]", error);
    // Surface Prisma validation errors explicitly so the UI can show a useful message
    // rather than the generic fallback.
    if (
      error instanceof Error &&
      error.constructor.name === "PrismaClientValidationError"
    ) {
      return NextResponse.json(
        { error: "שגיאת אימות נתונים — בדוק את פרטי החוזה ונסה שוב" },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "שגיאה ביצירת החוזה — אנא נסה שוב" }, { status: 500 });
  }
}
