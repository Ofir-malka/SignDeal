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
import { parsePositiveInt, parseNonNegativeInt, parseEnum, parseOptionalEnum, parseOptionalPositiveFloat, parseOptionalInt, parseOptionalDate, firstError } from "@/lib/validate";
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
      // Primaries + standalone contracts only. Secondary package documents (the
      // linked general exclusivity agreement, relatedContractId != null) are
      // legally separate records but ONE owner signing package in the broker UI —
      // they stay reachable via their signing link, /contracts/[id], PDF and /verify.
      where: { userId, relatedContractId: null },
      include: { client: true, payment: true, template: { select: { templateKey: true } } },
      orderBy: { createdAt: "desc" },
    });
    // Flatten the resolved template key (additive field) — lets broker-side
    // surfaces gate fee chrome for fee-free documents (hidesFeeChrome /
    // OWNER_EXCLUSIVE_GENERAL) without a nested template object.
    return NextResponse.json(
      contracts.map(({ template, ...c }) => ({ ...c, templateKey: template?.templateKey ?? null })),
    );
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
      propertySalePrice,   // agorot; only expected when dealType === "BOTH" (propertyPrice = monthly rent there)
      clientName,
      clientPhone,
      clientEmail,
      clientIdNumber,
      propertyId,
      existingClientDbId,
      hideFullAddressFromClient,
      rentalCommissionMode,   // "ONE_MONTH" (legacy) | "FIXED" | "MONTHS" — rental fee mode
      rentalCommissionMonths, // 1-12 — required when rentalCommissionMode = "MONTHS"
      saleCommissionMode,     // "PERCENT" | "FIXED"   — sale fee mode (interested + owner service-order)
      saleCommissionPercent,  // human percent (2, 1.5) — only when saleCommissionMode = "PERCENT"
      exclusivityStartsAt,    // exclusivity period start — required when the mode includes exclusivity
      exclusivityEndsAt,      // exclusivity period end   — required when the mode includes exclusivity
      includeExclusivity,     // LEGACY alias — true maps to ownerMode "serviceWithExclusivity"
      ownerMode,              // "serviceOnly" (default) | "serviceWithExclusivity" | "exclusivityOnly"
      counterpartyBrokerLicenseNumber, // broker cooperation only — optional Broker B license number
      coopType,               // broker cooperation only — "sharedPool" (default) | "eachSide"
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
    const vRentalMode = parseOptionalEnum(rentalCommissionMode, ["ONE_MONTH", "FIXED", "MONTHS"] as const, "אופן דמי התיווך");
    // 1-12 monthly rents — only meaningful when rentalCommissionMode = MONTHS
    const vRentalMonths = parseOptionalInt(rentalCommissionMonths, "מספר חודשי שכירות", 1, 12);
    // Optional: how the sale fee was chosen (+ its percent). Only persisted for
    // the sale interested template (see resolvedSaleMode below).
    const vSaleMode = parseOptionalEnum(saleCommissionMode, ["PERCENT", "FIXED"] as const, "אופן עמלת מכירה");
    const vSalePct  = parseOptionalPositiveFloat(saleCommissionPercent, "אחוז עמלת מכירה", 100);
    // Exclusivity period — required later when the resolved key is owner-exclusive
    const vExclusivityStart = parseOptionalDate(exclusivityStartsAt, "תחילת תקופת הבלעדיות");
    const vExclusivityEnd   = parseOptionalDate(exclusivityEndsAt,   "סיום תקופת הבלעדיות");
    // Owner document mode — which owner document(s) this submission creates
    const vOwnerMode = parseOptionalEnum(ownerMode, ["serviceOnly", "serviceWithExclusivity", "exclusivityOnly"] as const, "מצב מסמכי החתמה");
    const validationError = firstError(vDealType, vPropertyPrice, vCommission, vRentalMode, vRentalMonths, vSaleMode, vSalePct, vExclusivityStart, vExclusivityEnd, vOwnerMode);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    // Narrowing: all Results are Ok beyond this point (firstError returned early on any Err)
    if (!vDealType.ok || !vPropertyPrice.ok || !vCommission.ok || !vRentalMode.ok || !vRentalMonths.ok || !vSaleMode.ok || !vSalePct.ok || !vExclusivityStart.ok || !vExclusivityEnd.ok || !vOwnerMode.ok) {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }
    const validatedDealType = vDealType.value;
    const validatedPropertyPrice = vPropertyPrice.value;
    const validatedCommission = vCommission.value;

    // ── Owner document mode ───────────────────────────────────────────────────
    // serviceOnly (default): one service-order document (fee terms).
    // serviceWithExclusivity: service-order primary + linked OWNER_EXCLUSIVE_GENERAL.
    // exclusivityOnly: one standalone OWNER_EXCLUSIVE_ONLY document — it creates
    // no owner fee obligation, so every commission amount/mode is skipped and
    // forced off server-side (the UI hiding the fields is not the guarantee).
    // Legacy alias: includeExclusivity === true (older payloads, ownerMode
    // omitted) maps to serviceWithExclusivity.
    const resolvedOwnerMode: "serviceOnly" | "serviceWithExclusivity" | "exclusivityOnly" =
      vOwnerMode.value ?? (includeExclusivity === true ? "serviceWithExclusivity" : "serviceOnly");
    const isExclusivityOnly = resolvedOwnerMode === "exclusivityOnly";
    // Broker-cooperation documents carry no fee amounts either (shared-pool
    // division terms only) — same fee-free treatment as exclusivityOnly.
    const isBrokerCoop = contractType === CONTRACT_TYPE.BROKER_COOP;
    // Fee-free documents: commission forced 0 server-side regardless of the
    // body value (the UI hiding the fields is not the guarantee).
    const effectiveCommission = (isExclusivityOnly || isBrokerCoop) ? 0 : validatedCommission;
    // Sanitized optional counterparty (Broker B) license — trimmed; empty/non-
    // string becomes null. Persisted only for the cooperation key below.
    const coopLicense =
      typeof counterpartyBrokerLicenseNumber === "string" && counterpartyBrokerLicenseNumber.trim()
        ? counterpartyBrokerLicenseNumber.trim()
        : null;

    // Cooperation subtype selector. Validated ONLY for the cooperation category:
    // a stray coopType on any other category is ignored (never a 400), per the
    // approved contract. parseOptionalEnum returns ok(null) for omitted/empty
    // (→ sharedPool default) and err only for a non-empty invalid value (→ 400
    // here). Applied to the resolved template key after autoKey is computed.
    const vCoopType = parseOptionalEnum(coopType, ["sharedPool", "eachSide"] as const, "סוג שיתוף הפעולה");
    if (isBrokerCoop && !vCoopType.ok) {
      return NextResponse.json({ error: vCoopType.error }, { status: 400 });
    }
    const resolvedCoopType: "sharedPool" | "eachSide" =
      (isBrokerCoop && vCoopType.ok ? vCoopType.value : null) ?? "sharedPool";

    // ── BOTH deal type: validate commissionSale (sale-side commission) ────────
    // SALE and RENTAL contracts must NOT include commissionSale.
    // BOTH contracts must include a non-negative integer for the sale commission
    // — except the fee-free documents (exclusivityOnly / broker cooperation),
    // whose documents carry no fee amounts (forced null).
    let validatedCommissionSale: number | null = null;
    if (validatedDealType === "BOTH" && !isExclusivityOnly && !isBrokerCoop) {
      const vCommissionSale = parseNonNegativeInt(commissionSale, "עמלת מכירה");
      if (!vCommissionSale.ok) {
        return NextResponse.json({ error: vCommissionSale.error }, { status: 400 });
      }
      validatedCommissionSale = vCommissionSale.value;
    }

    // ── BOTH deal type: validate propertySalePrice (sale asking price) ────────
    // For BOTH, propertyPrice holds the MONTHLY RENT, so the sale price needs its
    // own field (displayed in the property table as "מחיר מכירה"). Required for
    // BOTH; forced null for SALE/RENTAL (SALE keeps propertyPrice as the sale price).
    let validatedPropertySalePrice: number | null = null;
    if (validatedDealType === "BOTH") {
      const vPropertySalePrice = parsePositiveInt(propertySalePrice, "מחיר מכירה");
      if (!vPropertySalePrice.ok) {
        return NextResponse.json({ error: vPropertySalePrice.error }, { status: 400 });
      }
      validatedPropertySalePrice = vPropertySalePrice.value;
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
      // BROKER_COOP is intentionally absent: the legacy generic key is retired
      // (never used in production) — every cooperation creation resolves via
      // the dealType map below to BROKER_COOP_SHARED_POOL.
    };
    const TEMPLATE_KEY_BY_TYPE_AND_DEAL: Record<string, Partial<Record<string, string>>> = {
      [CONTRACT_TYPE.INTERESTED]: {
        RENTAL: "INTERESTED_BUYER_RENTAL",
        SALE:   "INTERESTED_BUYER_SALE",
        BOTH:   "INTERESTED_BUYER_BOTH",
      },
      // Owner flow: the service-order agreement (fee terms) is the PRIMARY
      // document for every deal type. OWNER_EXCLUSIVE_GENERAL is intentionally
      // NOT here — the optional exclusivity document is never dealType-resolved
      // (Phase 2/3 creates it explicitly alongside the primary). The deprecated
      // OWNER_EXCLUSIVE_RENTAL/SALE keys are no longer reachable.
      [CONTRACT_TYPE.OWNER_EXCLUSIVE]: {
        RENTAL: "OWNER_SERVICE_ORDER_RENTAL",
        SALE:   "OWNER_SERVICE_ORDER_SALE",
        BOTH:   "OWNER_SERVICE_ORDER_BOTH",
      },
      // Broker cooperation: the shared-pool agreement is the first production
      // key of the family; every deal type resolves to it (dealType still
      // drives the annex price rows). A future coopType selector slots in here
      // when a second cooperation subtype ships (pattern: ownerMode).
      [CONTRACT_TYPE.BROKER_COOP]: {
        RENTAL: "BROKER_COOP_SHARED_POOL",
        SALE:   "BROKER_COOP_SHARED_POOL",
        BOTH:   "BROKER_COOP_SHARED_POOL",
      },
    };

    let generatedText: string | null = null;
    let resolvedTemplateId: string | null = null;

    let autoKey =
      TEMPLATE_KEY_BY_TYPE_AND_DEAL[contractType]?.[validatedDealType]
      ?? CONTRACT_TYPE_TO_TEMPLATE_KEY[contractType]
      ?? null;
    // exclusivityOnly: the standalone exclusivity document replaces the
    // dealType-resolved service-order key. dealType itself stays validated and
    // stored — it drives the annex price rows (rent / sale price / BOTH dual).
    // Every downstream fee-mode allowlist excludes this key, so no commission
    // modes are validated or persisted for it.
    if (isExclusivityOnly) {
      autoKey = "OWNER_EXCLUSIVE_ONLY";
    }
    // Cooperation subtype: the shared-pool baseline (from the dealType map above)
    // is overridden to the each-side template when coopType = "eachSide".
    // Omitted/sharedPool keeps BROKER_COOP_SHARED_POOL — the default.
    if (isBrokerCoop && resolvedCoopType === "eachSide") {
      autoKey = "BROKER_COOP_EACH_SIDE";
    }
    // Whether the resolved key is a broker-cooperation document (either subtype).
    // Gates the optional Broker B license persistence + buildContext pass below —
    // generalized from the single shared-pool key so both subtypes carry it.
    const isCoopKey = autoKey === "BROKER_COOP_SHARED_POOL" || autoKey === "BROKER_COOP_EACH_SIDE";

    // Persist the rental commission mode ONLY for templates whose clause needs it
    // (interested rental/both + owner service-order rental/both). The interested
    // flows keep their released ONE_MONTH default; the owner service-order flow
    // requires an explicit choice — missing data must never silently become
    // one month (product rule).
    const isOwnerRentalFeeKey =
      autoKey === "OWNER_SERVICE_ORDER_RENTAL" || autoKey === "OWNER_SERVICE_ORDER_BOTH";
    if (isOwnerRentalFeeKey && vRentalMode.value == null) {
      return NextResponse.json({ error: "יש לבחור אופן דמי תיווך" }, { status: 400 });
    }
    const resolvedRentalMode: "ONE_MONTH" | "FIXED" | "MONTHS" | null =
      autoKey === "INTERESTED_BUYER_RENTAL" || autoKey === "INTERESTED_BUYER_BOTH" || isOwnerRentalFeeKey
        ? (vRentalMode.value ?? "ONE_MONTH")
        : null;

    // MONTHS mode (1-12 monthly rents) is supported by the templates whose rental
    // fee clause is months-based (interested rental/both + owner service-order
    // rental/both); the count is required with it.
    if (
      resolvedRentalMode === "MONTHS"
      && autoKey !== "INTERESTED_BUYER_RENTAL"
      && autoKey !== "INTERESTED_BUYER_BOTH"
      && !isOwnerRentalFeeKey
    ) {
      return NextResponse.json({ error: "אופן דמי התיווך אינו נתמך עבור סוג חוזה זה" }, { status: 400 });
    }
    const resolvedRentalMonths: number | null =
      resolvedRentalMode === "MONTHS" ? vRentalMonths.value : null;
    if (resolvedRentalMode === "MONTHS" && resolvedRentalMonths == null) {
      return NextResponse.json({ error: "יש לבחור מספר חודשי שכירות" }, { status: 400 });
    }

    // ── Owner exclusivity modes ───────────────────────────────────────────────
    // serviceWithExclusivity: the general exclusivity document
    // (OWNER_EXCLUSIVE_GENERAL) is a SECONDARY record created alongside the
    // owner service-order primary in one transaction — never dealType-resolved,
    // consumes NO extra usage unit (see the transaction below).
    // exclusivityOnly: the standalone document (OWNER_EXCLUSIVE_ONLY) is the
    // single record itself. Both modes require the exclusivity period; both are
    // owner-flow-only.
    const wantsExclusivity = resolvedOwnerMode === "serviceWithExclusivity";
    if (resolvedOwnerMode !== "serviceOnly" && contractType !== CONTRACT_TYPE.OWNER_EXCLUSIVE) {
      return NextResponse.json({ error: "הסכם בלעדיות זמין רק בהחתמת בעל נכס" }, { status: 400 });
    }
    let resolvedExclusivityStart: Date | null = null;
    let resolvedExclusivityEnd: Date | null = null;
    if (resolvedOwnerMode !== "serviceOnly") {
      if (!vExclusivityStart.value || !vExclusivityEnd.value) {
        return NextResponse.json({ error: "יש להזין תקופת בלעדיות" }, { status: 400 });
      }
      if (vExclusivityEnd.value <= vExclusivityStart.value) {
        return NextResponse.json({ error: "תאריך סיום הבלעדיות חייב להיות מאוחר מתאריך ההתחלה" }, { status: 400 });
      }
      resolvedExclusivityStart = vExclusivityStart.value;
      resolvedExclusivityEnd   = vExclusivityEnd.value;
    }

    // Persist the sale commission mode + percent ONLY for templates whose clause
    // needs them (interested sale/both + owner service-order sale/both). Absent
    // mode defaults to FIXED so the sale clause always states the stored amount
    // (truthful + deterministic across regeneration).
    const resolvedSaleMode: "PERCENT" | "FIXED" | null =
      autoKey === "INTERESTED_BUYER_SALE" || autoKey === "INTERESTED_BUYER_BOTH"
      || autoKey === "OWNER_SERVICE_ORDER_SALE" || autoKey === "OWNER_SERVICE_ORDER_BOTH"
        ? (vSaleMode.value ?? "FIXED")
        : null;
    const resolvedSalePercent: number | null =
      resolvedSaleMode === "PERCENT" ? vSalePct.value : null;
    if (resolvedSaleMode === "PERCENT" && resolvedSalePercent == null) {
      return NextResponse.json({ error: "יש להזין אחוז עמלה" }, { status: 400 });
    }

    if (autoKey) {
      const templateKey = autoKey as "INTERESTED_BUYER" | "OWNER_EXCLUSIVE" | "INTERESTED_BUYER_RENTAL" | "INTERESTED_BUYER_SALE" | "INTERESTED_BUYER_BOTH" | "OWNER_SERVICE_ORDER_RENTAL" | "OWNER_SERVICE_ORDER_SALE" | "OWNER_SERVICE_ORDER_BOTH" | "OWNER_EXCLUSIVE_ONLY" | "BROKER_COOP_SHARED_POOL" | "BROKER_COOP_EACH_SIDE";
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
          contract: { id: "pending", propertyAddress, propertyCity, propertyPrice: validatedPropertyPrice, dealType: validatedDealType, commission: effectiveCommission, commissionSale: validatedCommissionSale, rentalCommissionMode: resolvedRentalMode, rentalCommissionMonths: resolvedRentalMonths, saleCommissionMode: resolvedSaleMode, saleCommissionPercent: resolvedSalePercent, templateKey: autoKey, exclusivityStartsAt: resolvedExclusivityStart, exclusivityEndsAt: resolvedExclusivityEnd, counterpartyBrokerLicenseNumber: isCoopKey ? coopLicense : null, createdAt: new Date() },
        });
        generatedText = resolveTemplate(tpl.content, ctx);
        resolvedTemplateId = tpl.id;
      }
      // No active template for this type → graceful fallback (generatedText stays null)
    }

    // Resolve the exclusivity template BEFORE the transaction — fail fast with
    // nothing created if it is missing (a seeded environment always has it).
    let exclusivityTpl: { id: string; content: string } | null = null;
    if (wantsExclusivity) {
      const exclusivityLang = language as "HE" | "EN" | "FR" | "RU" | "AR";
      exclusivityTpl =
        await prisma.contractTemplate.findFirst({
          where: { templateKey: "OWNER_EXCLUSIVE_GENERAL", language: exclusivityLang, isActive: true },
          select: { id: true, content: true },
        }) ??
        await prisma.contractTemplate.findFirst({
          where: { templateKey: "OWNER_EXCLUSIVE_GENERAL", language: "HE", isActive: true },
          select: { id: true, content: true },
        });
      if (!exclusivityTpl) {
        return NextResponse.json({ error: "תבנית הסכם הבלעדיות אינה זמינה" }, { status: 422 });
      }
    }

    const signatureToken = randomUUID();

    // ── Create contract + immutable usage event in one transaction ───────────
    // ContractUsageEvent is the authoritative monthly usage ledger.
    // Writing both atomically guarantees no contract can exist without a
    // corresponding usage event (crash-safe) and no event exists without a
    // contract (double-count safe).
    const { newContract: contract, exclusivityContract } = await prisma.$transaction(async (tx) => {
      const newContract = await tx.contract.create({
        data: {
          contractType,
          dealType: validatedDealType,
          propertyAddress,
          propertyCity,
          propertyPrice: validatedPropertyPrice,
          commission: effectiveCommission,
          // Broker cooperation (either subtype): optional counterparty (Broker B)
          // license — persisted so sign-time regeneration keeps the party-line suffix.
          ...(isCoopKey && coopLicense
            ? { counterpartyBrokerLicenseNumber: coopLicense }
            : {}),
          ...(validatedCommissionSale !== null ? { commissionSale: validatedCommissionSale } : {}),
          ...(validatedPropertySalePrice !== null ? { propertySalePrice: validatedPropertySalePrice } : {}),
          // exclusivityOnly: the standalone document itself carries the period
          // (clause 5); the package mode persists it on the SECONDARY instead.
          ...(isExclusivityOnly && resolvedExclusivityStart && resolvedExclusivityEnd
            ? { exclusivityStartsAt: resolvedExclusivityStart, exclusivityEndsAt: resolvedExclusivityEnd }
            : {}),
          ...(resolvedRentalMode ? { rentalCommissionMode: resolvedRentalMode } : {}),
          ...(resolvedRentalMonths != null ? { rentalCommissionMonths: resolvedRentalMonths } : {}),
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
      // PRIMARY ONLY: the optional exclusivity secondary below intentionally
      // writes NO usage event — a two-document owner package consumes exactly
      // one usage unit.
      await tx.contractUsageEvent.create({
        data: {
          userId: user.id,
          contractId: newContract.id,
          plan: usageCheck.plan,
        },
      });

      // ── Optional secondary: the general exclusivity document ───────────────
      // Created AFTER the primary so its generatedText can cite the primary's
      // doc number/date ({{serviceOrderNumber}}/{{serviceOrderDate}}); linked
      // via relatedContractId so sign-time regeneration stays deterministic.
      let exclusivityRecord: { id: string; signatureToken: string | null } | null = null;
      if (wantsExclusivity && exclusivityTpl) {
        const exclusivityCtx = buildContext({
          broker: { fullName: user.fullName, licenseNumber: user.licenseNumber ?? null, phone: user.phone ?? null, idNumber: user.idNumber ?? null },
          client: { name: client.name, idNumber: client.idNumber || "", phone: client.phone, email: client.email || "", address: client.address ?? null },
          contract: {
            id: "pending",
            propertyAddress,
            propertyCity,
            propertyPrice: validatedPropertyPrice,
            dealType: validatedDealType,
            commission: 0,
            commissionSale: null,
            templateKey: "OWNER_EXCLUSIVE_GENERAL",
            exclusivityStartsAt: resolvedExclusivityStart,
            exclusivityEndsAt:   resolvedExclusivityEnd,
            serviceOrder: { id: newContract.id, createdAt: newContract.createdAt },
            createdAt: new Date(),
          },
        });
        exclusivityRecord = await tx.contract.create({
          data: {
            contractType,
            dealType: validatedDealType,
            propertyAddress,
            propertyCity,
            propertyPrice: validatedPropertyPrice,
            ...(validatedPropertySalePrice !== null ? { propertySalePrice: validatedPropertySalePrice } : {}),
            commission: 0,   // fee terms live in the service-order sibling; chrome is key-suppressed
            exclusivityStartsAt: resolvedExclusivityStart!,
            exclusivityEndsAt:   resolvedExclusivityEnd!,
            relatedContractId:   newContract.id,
            userId: user.id,
            clientId: client.id,
            signatureToken: randomUUID(),
            status: "SENT",
            sentAt: new Date(),
            hideFullAddressFromClient: false,
            language,
            ...(propertyId ? { propertyId } : {}),
            templateId: exclusivityTpl.id,
            generatedText: resolveTemplate(exclusivityTpl.content, exclusivityCtx),
          },
          select: { id: true, signatureToken: true },
        });
      }

      return { newContract, exclusivityContract: exclusivityRecord };
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

    // ── Optional exclusivity secondary: audit + signing links ────────────────
    // Mirrors the primary — both documents go to the owner separately, per the
    // two-documents notice shown in the wizard before submit.
    if (exclusivityContract) {
      await logAuditEvent({
        userId: userId,
        action: "contract.created",
        entityType: "contract",
        entityId: exclusivityContract.id,
        metadata: { contractType, dealType: validatedDealType, language, templateKey: "OWNER_EXCLUSIVE_GENERAL", relatedContractId: contract.id },
        ip: getRealIp(request),
        userAgent: request.headers.get("user-agent"),
      });
      await sendContractSms(
        { id: exclusivityContract.id, signatureToken: exclusivityContract.signatureToken!, propertyAddress, userId: user.id, clientId: client.id },
        client.phone,
        client.name,
        user.fullName,
      );
      after(async () => {
        await sendContractEmail(
          { id: exclusivityContract.id, signatureToken: exclusivityContract.signatureToken!, propertyAddress, userId: user.id, clientId: client.id },
          client.email,
          client.name,
          user.fullName,
        );
      });
    }

    // Response: byte-identical to the historical shape for a single contract;
    // a two-document package adds ONE optional additive field (non-breaking).
    return NextResponse.json(
      {
        ...contract,
        ...(exclusivityContract
          ? { exclusivityContract: { id: exclusivityContract.id, signatureToken: exclusivityContract.signatureToken } }
          : {}),
      },
      { status: 201 },
    );
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
