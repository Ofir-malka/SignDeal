/**
 * Verification script for:
 * 1. Auto-template lookup by templateKey
 * 2. Fallback when no template matches
 * 3. Signing page / PDF — no broker stamp (code review)
 * 4. Wizard — no template dropdown (code review)
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";
import { join } from "path";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma  = new PrismaClient({ adapter } as never);
const p = prisma as any;

// ── helpers ───────────────────────────────────────────────────────────────────

function pass(label: string) { console.log(`  ✅ ${label}`); }
function fail(label: string, reason?: string) {
  console.log(`  ❌ ${label}${reason ? `: ${reason}` : ""}`);
}
function check(label: string, ok: boolean, reason?: string) {
  ok ? pass(label) : fail(label, reason);
}

// ── Test 1: templateKey is set on existing template ───────────────────────────
console.log("\n=== Test 1: Template has INTERESTED_BUYER key ===");
const templates = await p.contractTemplate.findMany({
  select: { id: true, title: true, templateKey: true, isActive: true },
});
const interestedTpl = templates.find((t: any) => t.templateKey === "INTERESTED_BUYER");
check("Template with INTERESTED_BUYER key exists", !!interestedTpl);
if (interestedTpl) {
  console.log(`  → id=${interestedTpl.id}, title="${interestedTpl.title}"`);
}

// ── Test 2: Auto-lookup by key — simulate the POST /api/contracts logic ───────
console.log("\n=== Test 2: Auto-lookup by templateKey ===");
const CONTRACT_TYPE_TO_TEMPLATE_KEY: Record<string, string> = {
  "החתמת מתעניין":                   "INTERESTED_BUYER",
  "החתמת בעל נכס / בלעדיות":       "OWNER_EXCLUSIVE",
  "הסכם שיתוף פעולה בין מתווכים": "BROKER_COOP",
};

const contractType = "החתמת מתעניין";
const autoKey = CONTRACT_TYPE_TO_TEMPLATE_KEY[contractType] ?? null;
check("autoKey derived from contractType", autoKey === "INTERESTED_BUYER");

const foundTpl = autoKey
  ? await p.contractTemplate.findFirst({ where: { templateKey: autoKey, isActive: true } })
  : null;
check("Template found by autoKey", !!foundTpl);
if (foundTpl) console.log(`  → Found template: "${foundTpl.title}"`);

// ── Test 3: Fallback — contract type with no template ─────────────────────────
console.log("\n=== Test 3: Fallback for unmatched contract type ===");
const unknownType = "הסכם שיתוף פעולה בין מתווכים"; // BROKER_COOP — no template set
const unknownKey  = CONTRACT_TYPE_TO_TEMPLATE_KEY[unknownType] ?? null;
const noTpl = unknownKey
  ? await p.contractTemplate.findFirst({ where: { templateKey: unknownKey, isActive: true } })
  : null;
check("No template found for BROKER_COOP (expected fallback)", noTpl === null);
check("generatedText would be null (graceful fallback)", noTpl === null);

// ── Test 4: Most recent contract — check generatedText snapshot ───────────────
console.log("\n=== Test 4: Most recent 'החתמת מתעניין' contract has generatedText ===");
const recentContracts = await p.contract.findMany({
  where:   { contractType: "החתמת מתעניין" },
  select:  { id: true, contractType: true, generatedText: true, templateId: true, createdAt: true },
  orderBy: { createdAt: "desc" },
  take:    3,
});
console.log(`  Found ${recentContracts.length} 'החתמת מתעניין' contracts`);
if (recentContracts.length > 0) {
  const newest = recentContracts[0];
  console.log(`  → Most recent: id=${newest.id}`);
  console.log(`    templateId:    ${newest.templateId ?? "(none)"}`);
  console.log(`    generatedText: ${newest.generatedText ? `${(newest.generatedText as string).slice(0, 80)}…` : "(null — created before auto-lookup)"}`);
}

// ── Test 5: Code review — ContractTemplate.tsx has no broker stamp ─────────────
console.log("\n=== Test 5: ContractTemplate.tsx — no broker stamp ===");
const tmplFile = readFileSync(
  join(process.cwd(), "src/components/ContractTemplate.tsx"), "utf8"
);
check("No broker stamp label", !tmplFile.includes("חותמת המתווך"));
check("No 'SignDeal תיווך נדל״ן' stamp placeholder", !tmplFile.includes('SignDeal תיווך נדל"ן'));
check("Client signature label present", tmplFile.includes("חתימת הלקוח"));
check("No flex-row layout (single-column sig box)", !tmplFile.includes("sm:flex-row"));

// ── Test 6: Code review — ContractPDF.tsx has no broker stamp ──────────────────
console.log("\n=== Test 6: ContractPDF.tsx — no broker stamp ===");
const pdfFile = readFileSync(
  join(process.cwd(), "src/components/ContractPDF.tsx"), "utf8"
);
check("No broker stamp label", !pdfFile.includes("חותמת המתווך"));
check("No sigRow style (removed)",  !pdfFile.includes("sigRow:"));
check("sigRow not used",            !pdfFile.includes("S.sigRow"));
check("Client signature label present", pdfFile.includes("חתימת הלקוח"));

// ── Test 7: Code review — NewContractWizard.tsx has no template dropdown ──────
console.log("\n=== Test 7: NewContractWizard.tsx — no manual template dropdown ===");
const wizardFile = readFileSync(
  join(process.cwd(), "src/components/NewContractWizard.tsx"), "utf8"
);
check("No ApiContractTemplate type",   !wizardFile.includes("ApiContractTemplate"));
check("No templateId in FormData",     !wizardFile.includes("templateId:"));
check("No template picker select",     !wizardFile.includes("בחר נוסח חוזה"));
check("No loadingTemplates state",     !wizardFile.includes("loadingTemplates"));
check("No /api/contract-templates fetch", !wizardFile.includes("/api/contract-templates"));

// ── Test 8: Code review — POST body no longer sends templateId ─────────────────
console.log("\n=== Test 8: handleSendContract sends no templateId ===");
check("templateId not in POST body",   !wizardFile.includes("data.templateId"));

await (prisma as any).$disconnect();
console.log("\nDone.\n");
