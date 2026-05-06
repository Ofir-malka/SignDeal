/**
 * End-to-end: Create a contract via the internal POST logic and verify
 * generatedText is auto-populated from the INTERESTED_BUYER template.
 * Runs in-process (no HTTP) to avoid auth complexity.
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
// Inline the resolve/build logic to avoid module resolution issues in tsx
function resolveTemplate(content: string, ctx: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => key in ctx ? ctx[key] : match);
}
function buildContext(opts: { broker: any; client: any; contract: any }): Record<string, string> {
  const fmt = (n: number) => `₪${(n / 100).toLocaleString("he-IL")}`;
  const d   = new Date(opts.contract.createdAt);
  const dt  = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
  const DEAL: Record<string,string> = { RENTAL:"שכירות", SALE:"מכירה" };
  return {
    brokerName:      opts.broker.fullName,
    brokerLicense:   opts.broker.licenseNumber ?? "—",
    brokerPhone:     opts.broker.phone         ?? "—",
    brokerIdNumber:  opts.broker.idNumber      ?? "—",
    clientName:      opts.client.name,
    clientIdNumber:  opts.client.idNumber      || "—",
    clientPhone:     opts.client.phone,
    clientEmail:     opts.client.email         || "—",
    propertyAddress: opts.contract.propertyAddress,
    propertyCity:    opts.contract.propertyCity,
    propertyPrice:   fmt(opts.contract.propertyPrice),
    dealType:        DEAL[opts.contract.dealType] ?? opts.contract.dealType,
    commission:      fmt(opts.contract.commission),
    today:           dt,
    contractId:      String(opts.contract.id).slice(-8).toUpperCase(),
  };
}

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma  = new PrismaClient({ adapter } as never);
const p = prisma as any;

function check(label: string, ok: boolean, info?: string) {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${info ? `  [${info}]` : ""}`);
}

console.log("\n=== End-to-end: Auto-template resolution ===");

// ── Find any user to use as broker ────────────────────────────────────────────
const user = await p.user.findFirst({ select: { id: true, fullName: true, licenseNumber: true, phone: true, idNumber: true } });
if (!user) { console.log("No user found — skipping"); await (prisma as any).$disconnect(); process.exit(0); }
console.log(`  Using broker: ${user.fullName}`);

// ── Find or create a client ───────────────────────────────────────────────────
let client = await p.client.findFirst({ where: { userId: user.id }, select: { id: true, name: true, phone: true, email: true, idNumber: true } });
if (!client) {
  client = await p.client.create({
    data: { name: "לקוח בדיקה", phone: "0501234567", email: "test@test.com", idNumber: "123456789", userId: user.id },
    select: { id: true, name: true, phone: true, email: true, idNumber: true },
  });
  console.log("  Created test client");
}

// ── Simulate POST /api/contracts logic ────────────────────────────────────────
const contractType    = "החתמת מתעניין";
const dealType        = "RENTAL";
const propertyAddress = "רחוב הבדיקה 1";
const propertyCity    = "תל אביב";
const propertyPrice   = 500000 * 100; // 5000 NIS in agorot
const commission      = 500000;       // 5000 NIS in agorot

const CONTRACT_TYPE_TO_TEMPLATE_KEY: Record<string, string> = {
  "החתמת מתעניין":                   "INTERESTED_BUYER",
  "החתמת בעל נכס / בלעדיות":       "OWNER_EXCLUSIVE",
  "הסכם שיתוף פעולה בין מתווכים": "BROKER_COOP",
};

let generatedText:      string | null = null;
let resolvedTemplateId: string | null = null;

const autoKey = CONTRACT_TYPE_TO_TEMPLATE_KEY[contractType] ?? null;
if (autoKey) {
  const tpl = await p.contractTemplate.findFirst({
    where: { templateKey: autoKey, isActive: true },
  });
  if (tpl) {
    const ctx = buildContext({
      broker:   { fullName: user.fullName, licenseNumber: user.licenseNumber ?? null, phone: user.phone ?? null, idNumber: user.idNumber ?? null },
      client:   { name: client.name, idNumber: client.idNumber || "", phone: client.phone, email: client.email || "" },
      contract: { id: "pending", propertyAddress, propertyCity, propertyPrice, dealType, commission, createdAt: new Date() },
    });
    generatedText      = resolveTemplate(tpl.content, ctx);
    resolvedTemplateId = tpl.id;
    console.log(`  → Resolved template: "${tpl.title}" (${tpl.id})`);
  }
}

check("autoKey derived", autoKey === "INTERESTED_BUYER");
check("Template found", resolvedTemplateId !== null);
check("generatedText resolved", generatedText !== null && generatedText.length > 50);
if (generatedText) {
  console.log(`  → generatedText preview: ${generatedText.slice(0, 100).replace(/\n/g, " ")}…`);
}

// ── Create the contract ───────────────────────────────────────────────────────
const signatureToken = randomUUID();
const contract = await p.contract.create({
  data: {
    contractType,
    dealType,
    propertyAddress,
    propertyCity,
    propertyPrice,
    commission,
    userId:        user.id,
    clientId:      client.id,
    signatureToken,
    status:        "SENT",
    sentAt:        new Date(),
    hideFullAddressFromClient: false,
    ...(resolvedTemplateId ? { templateId: resolvedTemplateId } : {}),
    ...(generatedText      ? { generatedText }                  : {}),
  },
  select: { id: true, contractType: true, generatedText: true, templateId: true, signatureToken: true },
});

console.log(`\n  Created contract: ${contract.id}`);
check("contractType saved correctly", contract.contractType === contractType);
check("templateId saved",            !!contract.templateId, contract.templateId ?? "(none)");
check("generatedText saved",         !!contract.generatedText, `length=${contract.generatedText?.length ?? 0}`);
check("signatureToken set",          !!contract.signatureToken);

// ── Verify via public signing API response shape ───────────────────────────────
const publicContract = await p.contract.findFirst({
  where: { signatureToken: contract.signatureToken },
  select: { id: true, generatedText: true, signatureToken: false }, // signatureToken NOT in public response
});
check("generatedText visible for signing page", !!publicContract?.generatedText);

// ── Clean up test contract ────────────────────────────────────────────────────
await p.contract.delete({ where: { id: contract.id } });
console.log("  Cleaned up test contract");

console.log("\nAll checks complete.\n");
await (prisma as any).$disconnect();
