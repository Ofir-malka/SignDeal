import { randomUUID } from "crypto";
import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms, getSmsProviderName } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { requireUserId }          from "@/lib/require-user";
import { canUserCreateContract }  from "@/lib/subscription";
import { resolveTemplate, buildContext } from "@/lib/contracts/resolve-template";
import { rateLimit } from "@/lib/rate-limit";
import { parsePositiveInt, parseNonNegativeInt, parseEnum, firstError } from "@/lib/validate";
import { sendEmail, contractSigningEmail } from "@/lib/email";

// ─── SMS helper ───────────────────────────────────────────────────────────────
// Fire-and-forget: never throws, never blocks the HTTP response.
// All outcomes (SENT, FAILED, CANCELED) are persisted as Message records.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendContractSms(
  contract: {
    id:              string;
    signatureToken:  string;
    propertyAddress: string;
    userId:          string;
    clientId:        string;
  },
  clientPhone: string,
  clientName:  string,
  brokerName:  string,
): Promise<void> {
  try {
    const baseUrl         = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const testPhone       = process.env.SMS_TEST_PHONE?.trim() || "";
    const signingLink     = `${baseUrl}/contracts/sign/${contract.signatureToken}`;
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
          type:           "CONTRACT_SIGNING_LINK",
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

    // Create PENDING record before the network call so a crash mid-flight
    // still leaves an auditable record.
    const message = await prisma.message.create({
      data: {
        type:           "CONTRACT_SIGNING_LINK",
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
        ? {
            status:            "SENT",
            providerMessageId: result.messageId,
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
    id:              string;
    signatureToken:  string;
    propertyAddress: string;
    userId:          string;
    clientId:        string;
  },
  clientEmail: string,
  clientName:  string,
  brokerName:  string,
): Promise<void> {
  try {
    if (!clientEmail.trim()) {
      console.log(`[sendContractEmail] skipped — contract ${contract.id} has no client email`);
      return;
    }

    const baseUrl     = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const signingLink = `${baseUrl}/contracts/sign/${contract.signatureToken}`;

    const template = contractSigningEmail({
      clientName,
      brokerName,
      propertyAddress: contract.propertyAddress,
      signingLink,
    });

    // Create PENDING record before the network call so a crash mid-flight
    // still leaves an auditable record.
    const message = await prisma.message.create({
      data: {
        type:           "CONTRACT_SIGNING_LINK",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        contractId:     contract.id,
        clientId:       contract.clientId,
        userId:         contract.userId,
        recipientEmail: clientEmail.trim(),
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({ to: clientEmail.trim(), ...template });

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
      where:   { userId },
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
    const rl = rateLimit(userId, "contract-create", { max: 20, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי חוזים — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ── Subscription enforcement ───────────────────────────────────────────────
    // Checked after auth + rate-limit (both cheaper) and before body parsing.
    // canUserCreateContract() fetches subscription + active count in at most 2
    // queries; short-circuits after 1 when subscription is inactive.
    const usageCheck = await canUserCreateContract(userId);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: usageCheck.reason },   // "SUBSCRIPTION_INACTIVE" | "CONTRACT_LIMIT_REACHED"
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
      clientName,
      clientPhone,
      clientEmail,
      clientIdNumber,
      propertyId,
      existingClientDbId,
      hideFullAddressFromClient,
      language: rawLanguage,
    } = body;

    // Validate language — default HE, fallback to HE for any unknown value
    const VALID_LANGS = new Set(["HE", "EN", "FR", "RU", "AR"]);
    const language    = typeof rawLanguage === "string" && VALID_LANGS.has(rawLanguage.toUpperCase())
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
    const vDealType      = parseEnum(dealType,      ["SALE", "RENTAL"] as const, "סוג העסקה");
    const vPropertyPrice = parsePositiveInt(propertyPrice, "מחיר הנכס");
    const vCommission    = parseNonNegativeInt(commission, "עמלה");
    const validationError = firstError(vDealType, vPropertyPrice, vCommission);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    // Narrowing: all Results are Ok beyond this point (firstError returned early on any Err)
    if (!vDealType.ok || !vPropertyPrice.ok || !vCommission.ok) {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }
    const validatedDealType      = vDealType.value;
    const validatedPropertyPrice = vPropertyPrice.value;
    const validatedCommission    = vCommission.value;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Use existing client record if broker selected one, otherwise find-or-create by phone
    let client;
    if (existingClientDbId) {
      const found = await prisma.client.findUnique({ where: { id: existingClientDbId } });
      if (!found) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      client = found;
    } else {
      client = await prisma.client.findFirst({ where: { phone: clientPhone, userId: user.id } });
      if (!client) {
        client = await prisma.client.create({
          data: {
            name:     clientName,
            phone:    clientPhone,
            // email/idNumber are non-nullable String in schema — use "" not null
            email:    clientEmail?.trim() || "",
            idNumber: clientIdNumber?.trim() || "",
            // Use Prisma relation connect instead of scalar userId to satisfy v7 validation
            user: { connect: { id: user.id } },
          },
        });
      }
    }

    // Auto-resolve template snapshot by contract type.
    // generatedText is frozen at creation time — subsequent edits to the template
    // never affect contracts that have already been sent.
    const CONTRACT_TYPE_TO_TEMPLATE_KEY: Record<string, string> = {
      "החתמת מתעניין":                   "INTERESTED_BUYER",
      "החתמת בעל נכס / בלעדיות":       "OWNER_EXCLUSIVE",
      "הסכם שיתוף פעולה בין מתווכים": "BROKER_COOP",
    };

    let generatedText:      string | null = null;
    let resolvedTemplateId: string | null = null;

    const autoKey = CONTRACT_TYPE_TO_TEMPLATE_KEY[contractType] ?? null;
    if (autoKey) {
      const templateKey = autoKey as "INTERESTED_BUYER" | "OWNER_EXCLUSIVE" | "BROKER_COOP";
      const templateLang = language as "HE" | "EN" | "FR" | "RU" | "AR";

      // Resolve by (templateKey + language), fallback to HE if not found
      const tpl =
        await prisma.contractTemplate.findFirst({
          where: { templateKey, language: templateLang, isActive: true },
        }) ??
        await prisma.contractTemplate.findFirst({
          where: { templateKey, language: "HE",         isActive: true },
        });
      if (tpl) {
        const ctx = buildContext({
          broker:   { fullName: user.fullName, licenseNumber: user.licenseNumber ?? null, phone: user.phone ?? null, idNumber: user.idNumber ?? null },
          client:   { name: clientName, idNumber: clientIdNumber || "", phone: clientPhone, email: clientEmail || "" },
          contract: { id: "pending", propertyAddress, propertyCity, propertyPrice: validatedPropertyPrice, dealType: validatedDealType, commission: validatedCommission, createdAt: new Date() },
        });
        generatedText      = resolveTemplate(tpl.content, ctx);
        resolvedTemplateId = tpl.id;
      }
      // No active template for this type → graceful fallback (generatedText stays null)
    }

    const signatureToken = randomUUID();

    const contract = await prisma.contract.create({
      data: {
        contractType,
        dealType:      validatedDealType,
        propertyAddress,
        propertyCity,
        propertyPrice: validatedPropertyPrice,
        commission:    validatedCommission,
        userId:        user.id,
        clientId:      client.id,
        signatureToken,
        status:                   "SENT",
        sentAt:                   new Date(),
        hideFullAddressFromClient: hideFullAddressFromClient === true,
        language,
        ...(propertyId         ? { propertyId }                        : {}),
        ...(resolvedTemplateId ? { templateId: resolvedTemplateId }    : {}),
        ...(generatedText      ? { generatedText }                     : {}),
      },
      include: { client: true, payment: true },
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
