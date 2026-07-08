/**
 * resolve-template.test.ts
 *
 * Tests for buildContext, resolveTemplate, and parseDocumentLines.
 *
 * Critical invariants verified here:
 *   1. Client placeholders ({{clientName}}, {{clientPhone}}, {{clientEmail}},
 *      {{clientIdNumber}}) are populated exclusively from the `client` argument.
 *   2. Broker placeholders ({{brokerName}}, {{brokerPhone}}, {{brokerLicense}},
 *      {{brokerIdNumber}}) are populated exclusively from the `broker` argument.
 *   3. No broker field ever appears in a client placeholder, and vice versa.
 *   4. resolveTemplate leaves unknown placeholders intact (no silent data loss).
 *   5. Empty / null optional fields produce "—" rather than "" or "null".
 *
 * These tests were added as part of the client/broker identity mixing bugfix
 * (see: src/app/api/contracts/route.ts line ~376 comment).
 */

import { describe, it, expect } from "vitest";
import { buildContext, resolveTemplate, parseDocumentLines } from "./resolve-template";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BROKER = {
  fullName:      "אופיר מלכה",
  licenseNumber: "12345",
  phone:         "0501234567",
  idNumber:      "999999999",
};

const CLIENT = {
  name:     "גפן בראון",
  idNumber: "213908072",
  phone:    "0534417575",
  email:    "gaphen@example.com",
};

const CONTRACT = {
  id:              "cltest00001",
  propertyAddress: "רחוב הרצל 12||3|5",
  propertyCity:    "תל אביב",
  propertyPrice:   150_000_00,   // 150,000 ILS in agorot
  dealType:        "RENTAL",
  commission:      15_000_00,    // 15,000 ILS in agorot
  commissionSale:  null,
  createdAt:       new Date("2026-05-22T10:00:00Z"),
};

// ─── buildContext — client field isolation ────────────────────────────────────

describe("buildContext — client field isolation", () => {
  it("maps clientName from client.name, NOT from any broker field", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.clientName).toBe(CLIENT.name);
    expect(ctx.clientName).not.toBe(BROKER.fullName);
  });

  it("maps clientPhone from client.phone, NOT from broker.phone", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.clientPhone).toBe(CLIENT.phone);
    expect(ctx.clientPhone).not.toBe(BROKER.phone);
  });

  it("maps clientEmail from client.email, NOT from any broker field", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.clientEmail).toBe(CLIENT.email);
  });

  it("maps clientIdNumber from client.idNumber, NOT from broker.idNumber", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.clientIdNumber).toBe(CLIENT.idNumber);
    expect(ctx.clientIdNumber).not.toBe(BROKER.idNumber);
  });
});

// ─── buildContext — broker field isolation ────────────────────────────────────

describe("buildContext — broker field isolation", () => {
  it("maps brokerName from broker.fullName, NOT from client.name", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerName).toBe(BROKER.fullName);
    expect(ctx.brokerName).not.toBe(CLIENT.name);
  });

  it("maps brokerPhone from broker.phone, NOT from client.phone", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerPhone).toBe(BROKER.phone);
    expect(ctx.brokerPhone).not.toBe(CLIENT.phone);
  });

  it("maps brokerLicense from broker.licenseNumber", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerLicense).toBe(BROKER.licenseNumber);
  });

  it("maps brokerIdNumber from broker.idNumber, NOT from client.idNumber", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerIdNumber).toBe(BROKER.idNumber);
    expect(ctx.brokerIdNumber).not.toBe(CLIENT.idNumber);
  });
});

// ─── buildContext — null/empty optional field fallbacks ───────────────────────

describe("buildContext — null/empty optional field fallbacks", () => {
  const BROKER_NO_OPTIONALS = { fullName: "שרה כהן", licenseNumber: null, phone: null, idNumber: null };

  it("brokerLicense falls back to '—' when licenseNumber is null", () => {
    const ctx = buildContext({ broker: BROKER_NO_OPTIONALS, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerLicense).toBe("—");
  });

  it("brokerPhone falls back to '—' when phone is null", () => {
    const ctx = buildContext({ broker: BROKER_NO_OPTIONALS, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerPhone).toBe("—");
  });

  it("brokerIdNumber falls back to '—' when idNumber is null", () => {
    const ctx = buildContext({ broker: BROKER_NO_OPTIONALS, client: CLIENT, contract: CONTRACT });
    expect(ctx.brokerIdNumber).toBe("—");
  });

  it("clientIdNumber falls back to '—' when idNumber is empty string", () => {
    const ctx = buildContext({
      broker: BROKER,
      client: { ...CLIENT, idNumber: "" },
      contract: CONTRACT,
    });
    expect(ctx.clientIdNumber).toBe("—");
  });

  it("clientEmail falls back to '—' when email is empty string", () => {
    const ctx = buildContext({
      broker: BROKER,
      client: { ...CLIENT, email: "" },
      contract: CONTRACT,
    });
    expect(ctx.clientEmail).toBe("—");
  });
});

// ─── resolveTemplate — correct placeholder substitution ──────────────────────

describe("resolveTemplate — correct placeholder substitution", () => {
  it("substitutes {{clientName}} with client.name", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate("שם הלקוח: {{clientName}}", ctx);
    expect(out).toBe(`שם הלקוח: ${CLIENT.name}`);
  });

  it("substitutes {{brokerName}} with broker.fullName", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate("שם המתווך: {{brokerName}}", ctx);
    expect(out).toBe(`שם המתווך: ${BROKER.fullName}`);
  });

  it("never puts broker name in client placeholder position", () => {
    const template = "לקוח: {{clientName}} | מתווך: {{brokerName}}";
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate(template, ctx);

    // Client slot must contain the client name only
    expect(out).toContain(`לקוח: ${CLIENT.name}`);
    // Broker slot must contain the broker name only
    expect(out).toContain(`מתווך: ${BROKER.fullName}`);
    // Broker name must NOT appear in the client slot
    const clientSlot = out.split("|")[0];
    expect(clientSlot).not.toContain(BROKER.fullName);
  });

  it("never puts client name in broker placeholder position", () => {
    const template = "מתווך: {{brokerName}} | לקוח: {{clientName}}";
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate(template, ctx);

    const brokerSlot = out.split("|")[0];
    expect(brokerSlot).not.toContain(CLIENT.name);
  });

  it("never puts broker phone in client phone placeholder", () => {
    const template = "טלפון לקוח: {{clientPhone}} | טלפון מתווך: {{brokerPhone}}";
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate(template, ctx);

    expect(out).toContain(`טלפון לקוח: ${CLIENT.phone}`);
    expect(out).toContain(`טלפון מתווך: ${BROKER.phone}`);
    const clientPhoneSlot = out.split("|")[0];
    expect(clientPhoneSlot).not.toContain(BROKER.phone);
  });

  it("never puts broker idNumber in client idNumber placeholder", () => {
    const template = "ת״ז לקוח: {{clientIdNumber}} | ת״ז מתווך: {{brokerIdNumber}}";
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate(template, ctx);

    expect(out).toContain(`ת״ז לקוח: ${CLIENT.idNumber}`);
    expect(out).toContain(`ת״ז מתווך: ${BROKER.idNumber}`);
  });

  it("leaves unknown placeholders intact (no silent data loss)", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate("{{unknownField}} and {{clientName}}", ctx);
    expect(out).toContain("{{unknownField}}");
    expect(out).toContain(CLIENT.name);
  });

  it("substitutes all client fields in a full template correctly", () => {
    const template =
      "{{clientName}}\n{{clientIdNumber}}\n{{clientPhone}}\n{{clientEmail}}";
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    const out = resolveTemplate(template, ctx);
    const lines = out.split("\n");
    expect(lines[0]).toBe(CLIENT.name);
    expect(lines[1]).toBe(CLIENT.idNumber);
    expect(lines[2]).toBe(CLIENT.phone);
    expect(lines[3]).toBe(CLIENT.email);
  });
});

// ─── Regression: client completion PATCH merging ─────────────────────────────
// Simulates the PATCH logic: incoming fields override the existing record,
// and the merged result is used to regenerate generatedText.
// This is the critical path for Fix 2.

describe("resolveTemplate — client completion PATCH merge regression", () => {
  it("regenerated text uses the completed idNumber, not the original '—'", () => {
    const EXISTING_CLIENT_NO_ID = { ...CLIENT, idNumber: "" };   // idNumber missing at creation
    const PATCH_ID_NUMBER = "213908072";                         // client fills it in

    // Simulate the merge that happens in the PATCH handler
    const mergedClient = {
      name:     EXISTING_CLIENT_NO_ID.name,
      phone:    EXISTING_CLIENT_NO_ID.phone,
      email:    EXISTING_CLIENT_NO_ID.email,
      idNumber: PATCH_ID_NUMBER || EXISTING_CLIENT_NO_ID.idNumber,  // PATCH takes precedence
    };

    const ctx = buildContext({ broker: BROKER, client: mergedClient, contract: CONTRACT });
    const out = resolveTemplate("ת״ז: {{clientIdNumber}}", ctx);

    expect(out).toBe(`ת״ז: ${PATCH_ID_NUMBER}`);
    expect(out).not.toContain("—");
  });

  it("regenerated text uses the completed email, not the original '—'", () => {
    const EXISTING_CLIENT_NO_EMAIL = { ...CLIENT, email: "" };
    const PATCH_EMAIL = "new@example.com";

    const mergedClient = {
      name:     EXISTING_CLIENT_NO_EMAIL.name,
      phone:    EXISTING_CLIENT_NO_EMAIL.phone,
      idNumber: EXISTING_CLIENT_NO_EMAIL.idNumber,
      email:    PATCH_EMAIL || EXISTING_CLIENT_NO_EMAIL.email,
    };

    const ctx = buildContext({ broker: BROKER, client: mergedClient, contract: CONTRACT });
    const out = resolveTemplate("אימייל: {{clientEmail}}", ctx);

    expect(out).toBe(`אימייל: ${PATCH_EMAIL}`);
    expect(out).not.toContain("—");
  });

  it("regenerated text preserves existing phone when only idNumber is patched", () => {
    const PATCH = { idNumber: "213908072" };
    const mergedClient = {
      name:     CLIENT.name,
      phone:    CLIENT.phone,
      email:    CLIENT.email,
      idNumber: PATCH.idNumber ?? CLIENT.idNumber,
    };

    const ctx = buildContext({ broker: BROKER, client: mergedClient, contract: CONTRACT });
    const out = resolveTemplate("{{clientPhone}} | {{clientIdNumber}}", ctx);

    expect(out).toContain(CLIENT.phone);         // phone unchanged
    expect(out).toContain(PATCH.idNumber);       // idNumber updated
  });
});

// ─── parseDocumentLines ───────────────────────────────────────────────────────

describe("parseDocumentLines", () => {
  it("first non-empty line is title, second is subtitle", () => {
    const lines = parseDocumentLines("כותרת ראשית\nתת כותרת\n1. סעיף");
    expect(lines[0]).toEqual({ type: "title",    text: "כותרת ראשית" });
    expect(lines[1]).toEqual({ type: "subtitle", text: "תת כותרת" });
  });

  it("numbered clause lines parse correctly", () => {
    const lines = parseDocumentLines("T\nS\n3. some clause text");
    const numbered = lines.find((l) => l.type === "numbered");
    expect(numbered).toEqual({ type: "numbered", num: "3", text: "some clause text" });
  });

  it("blank lines become blank tokens", () => {
    const lines = parseDocumentLines("T\nS\n\nparagraph");
    expect(lines.some((l) => l.type === "blank")).toBe(true);
  });
});

// ─── buildContext — interested rental commission clause (dynamic 5.1, v3) ─────

describe("buildContext — interested rental commission clause", () => {
  // CONTRACT is dealType RENTAL with commission = ₪15,000

  it("FIXED mode states the stored commission amount (exact v3 sentence)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, rentalCommissionMode: "FIXED" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסך של ₪15,000, בתוספת מע"מ כדין.');
  });

  it("MONTHS mode with 1 month (exact v3 sentence)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, templateKey: "INTERESTED_BUYER_RENTAL", rentalCommissionMode: "MONTHS", rentalCommissionMonths: 1 },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
  });

  it("MONTHS mode with 2 months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, templateKey: "INTERESTED_BUYER_RENTAL", rentalCommissionMode: "MONTHS", rentalCommissionMonths: 2 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שני חודשים");
  });

  it("MONTHS mode with 6 months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, templateKey: "INTERESTED_BUYER_RENTAL", rentalCommissionMode: "MONTHS", rentalCommissionMonths: 6 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שישה חודשים");
  });

  it("MONTHS mode with 12 months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, templateKey: "INTERESTED_BUYER_RENTAL", rentalCommissionMode: "MONTHS", rentalCommissionMonths: 12 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שנים עשר חודשים");
  });

  it("legacy ONE_MONTH maps to the one-month sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, rentalCommissionMode: "ONE_MONTH" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
  });

  it("absent mode maps to the one-month sentence", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של חודש אחד");
  });

  it("MONTHS without a month count falls back to the fixed-amount sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, templateKey: "INTERESTED_BUYER_RENTAL", rentalCommissionMode: "MONTHS", rentalCommissionMonths: null },
    });
    expect(ctx.rentalCommissionClause).toContain("בסך של ₪15,000");
  });
});

// ─── buildContext — client residential address ────────────────────────────────

describe("buildContext — client address", () => {
  it("maps clientAddress from client.address", () => {
    const ctx = buildContext({
      broker: BROKER, client: { ...CLIENT, address: "רופין 9, תל אביב" }, contract: CONTRACT,
    });
    expect(ctx.clientAddress).toBe("רופין 9, תל אביב");
  });

  it("falls back to '—' when address is missing or empty", () => {
    const ctxMissing = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctxMissing.clientAddress).toBe("—");
    const ctxEmpty = buildContext({ broker: BROKER, client: { ...CLIENT, address: "" }, contract: CONTRACT });
    expect(ctxEmpty.clientAddress).toBe("—");
  });

  it("resolveTemplate substitutes {{clientAddress}} and {{rentalCommissionClause}}", () => {
    const ctx = buildContext({
      broker: BROKER, client: { ...CLIENT, address: "הרצל 1, חיפה" },
      contract: { ...CONTRACT, rentalCommissionMode: "FIXED" },
    });
    const out = resolveTemplate("כתובת: {{clientAddress}}\n5.1 {{rentalCommissionClause}}", ctx);
    expect(out).toContain("כתובת: הרצל 1, חיפה");
    expect(out).toContain("5.1 בשכירות – דמי תיווך");
  });
});

// ─── buildContext — sale commission clause (dynamic 5.1) ──────────────────────

describe("buildContext — sale commission clause", () => {
  const SALE_CONTRACT = { ...CONTRACT, dealType: "SALE" };

  it("PERCENT mode with 2% states the chosen percentage", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 2 },
    });
    expect(ctx.saleCommissionClause).toContain("בשיעור של 2% ממחיר העסקה הכולל");
    expect(ctx.saleCommissionClause).toContain('בתוספת מע"מ כדין');
  });

  it("PERCENT mode with a decimal percentage (1.5) renders as 1.5%", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 1.5 },
    });
    expect(ctx.saleCommissionClause).toContain("בשיעור של 1.5% ממחיר העסקה הכולל");
  });

  it("FIXED mode states the stored commission amount", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...SALE_CONTRACT, saleCommissionMode: "FIXED" },
    });
    expect(ctx.saleCommissionClause).toContain(`דמי תיווך בסך של ${ctx.commission}`);   // e.g. ₪15,000
    expect(ctx.saleCommissionClause).toContain('בתוספת מע"מ כדין');
  });

  it("falls back to the fixed-amount wording when the mode is absent", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: SALE_CONTRACT });
    expect(ctx.saleCommissionClause).toContain("דמי תיווך בסך של");
  });

  it("falls back to the fixed-amount wording when PERCENT is set without a percent", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: null },
    });
    expect(ctx.saleCommissionClause).toContain("דמי תיווך בסך של");
  });

  it("resolveTemplate substitutes {{saleCommissionClause}}", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 2 },
    });
    const out = resolveTemplate("5.1 {{saleCommissionClause}}", ctx);
    expect(out).toBe('5.1 ברכישת נכס – דמי תיווך בשיעור של 2% ממחיר העסקה הכולל, בתוספת מע"מ כדין.');
  });
});

// ─── buildContext — BOTH commission clauses (dealType-aware wordings) ─────────

describe("buildContext — BOTH commission clauses", () => {
  // For BOTH: commission = rental-side fee, commissionSale = sale-side fee.
  // v2 wordings: the rental half shares the interested-rental wording
  // ("בשכירות – …"); the sale half uses the BOTH wording ("בקנייה – …").
  const BOTH_CONTRACT = {
    ...CONTRACT,
    dealType:       "BOTH",
    commission:     4_500_00,    // rental-side: ₪4,500
    commissionSale: 30_000_00,   // sale-side:   ₪30,000
  };

  it("rental MONTHS with 1 month states one month", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 1 },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
  });

  it("rental MONTHS with 2 months states two months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 2 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שני חודשים");
  });

  it("rental MONTHS with 12 months states twelve months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 12 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שנים עשר חודשים");
  });

  it("rental legacy ONE_MONTH maps to the one-month sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, rentalCommissionMode: "ONE_MONTH" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
  });

  it("rental FIXED uses the amount from commission (the rental side)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, rentalCommissionMode: "FIXED" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסך של ₪4,500, בתוספת מע"מ כדין.');
    expect(ctx.rentalCommissionClause).not.toContain("₪30,000");
  });

  it("sale percent 2% uses the BOTH wording", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 2 },
    });
    expect(ctx.saleCommissionClause).toBe('בקנייה – דמי תיווך בשיעור של 2% ממחיר העסקה הכולל, בתוספת מע"מ כדין.');
  });

  it("sale percent 1.5% renders as 1.5%", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 1.5 },
    });
    expect(ctx.saleCommissionClause).toContain("בקנייה – דמי תיווך בשיעור של 1.5%");
  });

  it("sale FIXED uses the amount from commissionSale (NOT commission)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, saleCommissionMode: "FIXED" },
    });
    expect(ctx.saleCommissionClause).toBe('בקנייה – דמי תיווך בסך של ₪30,000, בתוספת מע"מ כדין.');
    expect(ctx.saleCommissionClause).not.toContain("₪4,500");
  });

  it("fallbacks: absent modes → one-month rental wording + fixed sale wording from commissionSale", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: BOTH_CONTRACT });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של חודש אחד");
    expect(ctx.saleCommissionClause).toContain("₪30,000");
  });

  it("resolveTemplate substitutes both BOTH clauses (rental-first v2 order)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...BOTH_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 2, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 2 },
    });
    const out = resolveTemplate("5.1 {{rentalCommissionClause}}\n5.2 {{saleCommissionClause}}", ctx);
    expect(out).toContain("5.1 בשכירות – דמי תיווך בסכום השווה לדמי שכירות של שני חודשים");
    expect(out).toContain("5.2 בקנייה – דמי תיווך בשיעור של 2%");
  });
});

// ─── Non-regression — SALE and RENTAL clause outputs must not change ──────────
// The dealType-aware branching added for BOTH must leave the existing SALE and
// RENTAL wordings byte-identical.

describe("non-regression — SALE and RENTAL clause wordings unchanged", () => {
  it("SALE percent wording pins the approved platform sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "SALE", saleCommissionMode: "PERCENT", saleCommissionPercent: 2 },
    });
    expect(ctx.saleCommissionClause).toBe('ברכישת נכס – דמי תיווך בשיעור של 2% ממחיר העסקה הכולל, בתוספת מע"מ כדין.');
  });

  it("SALE fixed wording is byte-identical (amount from commission)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "SALE", saleCommissionMode: "FIXED" },
    });
    expect(ctx.saleCommissionClause).toBe('ברכישת נכס – דמי תיווך בסך של ₪15,000, בתוספת מע"מ כדין.');
  });

  it("RENTAL legacy ONE_MONTH pins the v3 one-month sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "RENTAL", rentalCommissionMode: "ONE_MONTH" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
  });

  it("RENTAL fixed wording pins the v3 fixed sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "RENTAL", rentalCommissionMode: "FIXED" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסך של ₪15,000, בתוספת מע"מ כדין.');
  });
});

// ─── buildContext — owner-exclusive rental clause (templateKey-aware) ─────────

describe("buildContext — owner-exclusive rental commission clause", () => {
  const OWNER_CONTRACT = {
    ...CONTRACT,
    dealType:    "RENTAL",
    templateKey: "OWNER_EXCLUSIVE_RENTAL",
    commission:  9_000_00,   // ₪9,000 (e.g. 2 × ₪4,500 rent)
  };

  it("MONTHS mode with 1 month", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 1 },
    });
    expect(ctx.rentalCommissionClause).toBe('בעסקת שכירות, דמי התיווך יהיו בסכום השווה לדמי שכירות של חודש אחד, ללא תלות במשך תקופת השכירות, בתוספת מע"מ כדין.');
  });

  it("MONTHS mode with 2 months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 2 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שני חודשים, ללא תלות");
  });

  it("MONTHS mode with 6 months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 6 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שישה חודשים");
  });

  it("MONTHS mode with 12 months", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: 12 },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של שנים עשר חודשים");
  });

  it("FIXED mode states the stored commission amount", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "FIXED" },
    });
    expect(ctx.rentalCommissionClause).toBe('בעסקת שכירות, דמי התיווך יהיו בסך של ₪9,000, בתוספת מע"מ כדין.');
  });

  it("MONTHS mode without a month count falls back to the fixed-amount wording", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "MONTHS", rentalCommissionMonths: null },
    });
    expect(ctx.rentalCommissionClause).toContain("בסך של ₪9,000");
  });

  it("ONE_MONTH on the owner key is treated as one month (defensive)", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_CONTRACT, rentalCommissionMode: "ONE_MONTH" },
    });
    expect(ctx.rentalCommissionClause).toContain("דמי שכירות של חודש אחד, ללא תלות");
  });
});

// ─── buildContext — exclusivity period placeholders ───────────────────────────

describe("buildContext — exclusivity period", () => {
  it("formats persisted dates as DD.MM.YYYY", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: {
        ...CONTRACT, dealType: "RENTAL", templateKey: "OWNER_EXCLUSIVE_RENTAL",
        exclusivityStartsAt: new Date("2026-08-01T00:00:00"),
        exclusivityEndsAt:   new Date("2026-10-31T00:00:00"),
      },
    });
    expect(ctx.exclusivityStartDate).toBe("01.08.2026");
    expect(ctx.exclusivityEndDate).toBe("31.10.2026");
  });

  it("falls back to '—' when dates are absent", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.exclusivityStartDate).toBe("—");
    expect(ctx.exclusivityEndDate).toBe("—");
  });

  it("resolveTemplate substitutes the exclusivity clause", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: {
        ...CONTRACT, dealType: "RENTAL", templateKey: "OWNER_EXCLUSIVE_RENTAL",
        exclusivityStartsAt: new Date("2026-08-01T00:00:00"),
        exclusivityEndsAt:   new Date("2026-10-31T00:00:00"),
      },
    });
    const out = resolveTemplate("לתקופה שתחילתה ביום {{exclusivityStartDate}} וסיומה ביום {{exclusivityEndDate}}", ctx);
    expect(out).toBe("לתקופה שתחילתה ביום 01.08.2026 וסיומה ביום 31.10.2026");
  });
});

// ─── buildContext — owner-exclusive sale clause (templateKey-aware) ───────────

describe("buildContext — owner-exclusive sale commission clause", () => {
  const OWNER_SALE_CONTRACT = {
    ...CONTRACT,
    dealType:    "SALE",
    templateKey: "OWNER_EXCLUSIVE_SALE",
    // CONTRACT.commission = 1,500,000 agorot -> ₪15,000
  };

  it("PERCENT mode with 2% states the percentage of the sale price", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 2 },
    });
    expect(ctx.saleCommissionClause).toBe('בעסקת מכר, דמי התיווך יהיו בשיעור של 2% ממחיר המכירה הכולל של הנכס, בתוספת מע"מ כדין.');
  });

  it("PERCENT mode with a decimal percentage (1.5) renders as 1.5%", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 1.5 },
    });
    expect(ctx.saleCommissionClause).toContain("בשיעור של 1.5% ממחיר המכירה הכולל");
  });

  it("FIXED mode states the stored commission amount", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_SALE_CONTRACT, saleCommissionMode: "FIXED" },
    });
    expect(ctx.saleCommissionClause).toBe('בעסקת מכר, דמי התיווך יהיו בסך של ₪15,000, בתוספת מע"מ כדין.');
  });

  it("falls back to the fixed-amount wording when the mode is absent", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: OWNER_SALE_CONTRACT });
    expect(ctx.saleCommissionClause).toContain("בסך של ₪15,000");
  });

  it("falls back to the fixed-amount wording when PERCENT is set without a percent", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...OWNER_SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: null },
    });
    expect(ctx.saleCommissionClause).toContain("בסך של ₪15,000");
  });

  it("exclusivity placeholders render on the sale key", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: {
        ...OWNER_SALE_CONTRACT,
        exclusivityStartsAt: new Date("2026-08-01T00:00:00"),
        exclusivityEndsAt:   new Date("2026-10-31T00:00:00"),
      },
    });
    expect(ctx.exclusivityStartDate).toBe("01.08.2026");
    expect(ctx.exclusivityEndDate).toBe("31.10.2026");
  });
});

// ─── Non-regression — INTERESTED clauses unchanged when templateKey is passed ─
// The creation route now passes the resolved templateKey for EVERY contract.
// The interested-client keys must hit the existing branches and produce
// byte-identical output.

describe("non-regression — INTERESTED wordings unchanged with templateKey passed", () => {
  it("INTERESTED_BUYER_RENTAL legacy ONE_MONTH maps to the v3 one-month sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "RENTAL", templateKey: "INTERESTED_BUYER_RENTAL", rentalCommissionMode: "ONE_MONTH" },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
  });

  it("INTERESTED_BUYER_SALE percent clause pins the approved platform sentence", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "SALE", templateKey: "INTERESTED_BUYER_SALE", saleCommissionMode: "PERCENT", saleCommissionPercent: 2 },
    });
    expect(ctx.saleCommissionClause).toBe('ברכישת נכס – דמי תיווך בשיעור של 2% ממחיר העסקה הכולל, בתוספת מע"מ כדין.');
  });

  it("INTERESTED_BUYER_SALE fixed clause is byte-identical", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, dealType: "SALE", templateKey: "INTERESTED_BUYER_SALE", saleCommissionMode: "FIXED" },
    });
    expect(ctx.saleCommissionClause).toBe('ברכישת נכס – דמי תיווך בסך של ₪15,000, בתוספת מע"מ כדין.');
  });

  it("INTERESTED_BUYER_BOTH clauses pin the v2 sentences", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: {
        ...CONTRACT, dealType: "BOTH", templateKey: "INTERESTED_BUYER_BOTH",
        commission: 4_500_00, commissionSale: 30_000_00,
        rentalCommissionMode: "ONE_MONTH", saleCommissionMode: "FIXED",
      },
    });
    expect(ctx.rentalCommissionClause).toBe('בשכירות – דמי תיווך בסכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.');
    expect(ctx.saleCommissionClause).toBe('בקנייה – דמי תיווך בסך של ₪30,000, בתוספת מע"מ כדין.');
  });
});
