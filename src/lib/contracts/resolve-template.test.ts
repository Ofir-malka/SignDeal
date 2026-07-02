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

// ─── buildContext — rental commission clause (dynamic 6.1) ────────────────────

describe("buildContext — rental commission clause", () => {
  it("FIXED mode produces the fixed-amount wording with the formatted commission", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, rentalCommissionMode: "FIXED" },
    });
    expect(ctx.rentalCommissionClause).toContain("בסך");
    expect(ctx.rentalCommissionClause).toContain(ctx.commission);   // e.g. ₪15,000
    expect(ctx.rentalCommissionClause).toContain('בתוספת מע"מ כדין');
  });

  it("ONE_MONTH mode produces the one-month wording", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...CONTRACT, rentalCommissionMode: "ONE_MONTH" },
    });
    expect(ctx.rentalCommissionClause).toContain("חודש שכירות אחד");
  });

  it("defaults to the one-month wording when the mode is absent", () => {
    const ctx = buildContext({ broker: BROKER, client: CLIENT, contract: CONTRACT });
    expect(ctx.rentalCommissionClause).toContain("חודש שכירות אחד");
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
    const out = resolveTemplate("כתובת: {{clientAddress}}\n6.1 {{rentalCommissionClause}}", ctx);
    expect(out).toContain("כתובת: הרצל 1, חיפה");
    expect(out).toContain("6.1 בעסקאות שכירות");
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
    expect(ctx.saleCommissionClause).toContain("ל-2% ממחיר העסקה הכולל");
    expect(ctx.saleCommissionClause).toContain('בתוספת מע"מ כדין');
  });

  it("PERCENT mode with a decimal percentage (1.5) renders as 1.5%", () => {
    const ctx = buildContext({
      broker: BROKER, client: CLIENT,
      contract: { ...SALE_CONTRACT, saleCommissionMode: "PERCENT", saleCommissionPercent: 1.5 },
    });
    expect(ctx.saleCommissionClause).toContain("ל-1.5% ממחיר העסקה הכולל");
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
    expect(out).toBe('5.1 ברכישת נכס – סך השווה ל-2% ממחיר העסקה הכולל, בתוספת מע"מ כדין.');
  });
});
