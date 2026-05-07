import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { requireUserId } from "@/lib/require-user";
import { resolveTemplate, buildContext } from "@/lib/contracts/resolve-template";

// ─── SMS helper ───────────────────────────────────────────────────────────────
// Fire-and-forget: never throws, never blocks the HTTP response.
// All outcomes (SENT, FAILED, CANCELED) are persisted as Message records.

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
): Promise<void> {
  try {
    const baseUrl         = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const testPhone       = process.env.SMS_TEST_PHONE?.trim() || "";
    const signingLink     = `${baseUrl}/contracts/sign/${contract.signatureToken}`;
    const normalizedPhone = normalizeIsraeliPhone(clientPhone);

    const body =
      `שלום,\n` +
      `קיבלת הסכם לחתימה בקישור:\n` +
      `${signingLink}\n\n` +
      `SignDeal`;

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
          provider:       "infobip",
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
        provider:       "infobip",
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

    if (!contractType || !dealType || !propertyAddress || !propertyCity ||
        propertyPrice == null || commission == null) {
      return NextResponse.json({ error: "Missing required contract fields" }, { status: 400 });
    }
    if (!clientName || !clientPhone) {
      return NextResponse.json({ error: "Missing required client fields" }, { status: 400 });
    }

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
            email:    clientEmail?.trim() || null,   // "" → null so downstream email callers get null, not ""
            idNumber: clientIdNumber || "",
            userId:   user.id,
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
          contract: { id: "pending", propertyAddress, propertyCity, propertyPrice: Number(propertyPrice), dealType, commission: Number(commission), createdAt: new Date() },
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
        dealType,
        propertyAddress,
        propertyCity,
        propertyPrice: Number(propertyPrice),
        commission:    Number(commission),
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
    );

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts]", error);
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
  }
}
