/**
 * backfill-grow-business-meta.mts
 *
 * One-time, IDEMPOTENT, FILL-NULL-ONLY backfill of GrowBrokerMerchant.businessTitle
 * and .packageName for merchants onboarded before those columns existed. Source:
 * the most recent APPLIED GrowOnboardingCallbackEvent.sanitizedPayload for the
 * merchant's session (api_key is never present there — it's sealed in EncryptedSecret).
 *
 * SAFE BY DEFAULT: runs in DRY-RUN and only prints what it would change. Pass
 * --apply to write. Only fills columns that are currently NULL (never overwrites).
 * Never prints the broker apiKey; businessTitle is shown as a length, not its value.
 *
 * Usage:
 *   npx tsx scripts/backfill-grow-business-meta.mts            # dry-run (no writes)
 *   npx tsx scripts/backfill-grow-business-meta.mts --apply    # write fill-null-only
 *   DATABASE_URL="..." npx tsx scripts/backfill-grow-business-meta.mts --apply
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_URL: string = process.env.DATABASE_URL ?? "";
if (!DB_URL) throw new Error("DATABASE_URL env variable is not set");

const APPLY = process.argv.includes("--apply");
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter } as never);

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Extract business_title / package_name from a sanitizedPayload JSON string. */
function extract(sanitizedPayload: string): { businessTitle: string | null; packageName: string | null } {
  try {
    const root = JSON.parse(sanitizedPayload);
    const data = (root && typeof root === "object" && root.data && typeof root.data === "object")
      ? root.data
      : root;
    return {
      businessTitle: asString(data?.business_title),
      packageName: asString(data?.package_name),
    };
  } catch {
    return { businessTitle: null, packageName: null };
  }
}

async function main() {
  const host = DB_URL.match(/@([^/:?]+)/)?.[1] ?? "unknown";
  console.log(`[backfill-grow-business-meta] DB host: ${host} | mode: ${APPLY ? "APPLY (writes)" : "DRY-RUN (no writes)"}`);

  // Merchants missing either field.
  const merchants = await prisma.growBrokerMerchant.findMany({
    where: { OR: [{ businessTitle: null }, { packageName: null }] },
    select: { id: true, userId: true, businessTitle: true, packageName: true },
  });
  console.log(`candidates (missing businessTitle or packageName): ${merchants.length}`);

  let updated = 0, skippedNoEvent = 0, skippedNothingToSet = 0;
  for (const m of merchants) {
    const event = await prisma.growOnboardingCallbackEvent.findFirst({
      where: { outcome: "applied", parsedOk: true, session: { userId: m.userId } },
      orderBy: { receivedAt: "desc" },
      select: { sanitizedPayload: true },
    });
    if (!event) { skippedNoEvent++; console.log(`  - merchant ${m.id}: no applied callback event → skip`); continue; }

    const { businessTitle, packageName } = extract(event.sanitizedPayload);
    const data: { businessTitle?: string; packageName?: string } = {};
    if (m.businessTitle == null && businessTitle) data.businessTitle = businessTitle;
    if (m.packageName == null && packageName) data.packageName = packageName;

    if (Object.keys(data).length === 0) { skippedNothingToSet++; console.log(`  - merchant ${m.id}: nothing to fill → skip`); continue; }

    // Privacy: businessTitle may be a personal name → log a length, not the value. packageName is non-PII.
    const preview = [
      data.businessTitle ? `businessTitle(len=${data.businessTitle.length})` : null,
      data.packageName ? `packageName="${data.packageName}"` : null,
    ].filter(Boolean).join(", ");
    console.log(`  - merchant ${m.id}: ${APPLY ? "updating" : "would set"} ${preview}`);

    if (APPLY) {
      await prisma.growBrokerMerchant.update({ where: { id: m.id }, data });
      updated++;
    }
  }

  console.log(`done. ${APPLY ? `updated=${updated}` : "dry-run (no writes)"} skippedNoEvent=${skippedNoEvent} skippedNothingToSet=${skippedNothingToSet}`);
}

main()
  .catch((e) => { console.error("[backfill-grow-business-meta] ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
