/**
 * backfill-subscriptions.mts
 *
 * Phase 1 backfill: creates a Subscription row for every User that does not
 * yet have one. Safe to run multiple times (idempotent — skips existing rows).
 *
 * Beta policy applied to existing users:
 *   - plan:         PRO         (full access during beta)
 *   - status:       TRIALING
 *   - trialEndsAt:  now + 14 days
 *
 * This gives every existing beta user a 14-day Pro trial from the moment the
 * script runs. Adjust trialEndsAt below if you want a longer window.
 *
 * Usage:
 *   npx tsx scripts/backfill-subscriptions.mts
 *   — or (with explicit env) —
 *   DATABASE_URL="..." npx tsx scripts/backfill-subscriptions.mts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg }    from "@prisma/adapter-pg";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL env variable is not set");

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma  = new PrismaClient({ adapter } as never);

const TRIAL_DAYS = 14;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function main() {
  console.log("=".repeat(60));
  console.log("SignDeal — Subscription backfill");
  console.log("=".repeat(60));

  // ── 1. Find all users without a Subscription row ───────────────────────────
  const usersWithoutSub = await prisma.user.findMany({
    where:  { subscription: null },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const total = usersWithoutSub.length;

  if (total === 0) {
    console.log("✓ All users already have a Subscription row. Nothing to do.");
    return;
  }

  console.log(`Found ${total} user(s) without a Subscription. Creating rows…\n`);

  const trialEndsAt = addDays(new Date(), TRIAL_DAYS);
  let created = 0;
  let failed  = 0;

  for (const user of usersWithoutSub) {
    try {
      // ── 2. Create Subscription ─────────────────────────────────────────────
      const subscription = await prisma.subscription.create({
        data: {
          userId:      user.id,
          plan:        "PRO",
          status:      "TRIALING",
          trialEndsAt,
        },
      });

      // ── 3. Log the initial event ───────────────────────────────────────────
      await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          event:          "trial_started",
          fromPlan:       null,
          toPlan:         "PRO",
          fromStatus:     null,
          toStatus:       "TRIALING",
          source:         "registration",
          actorId:        null,
          metadata:       JSON.stringify({
            note:      "backfill — Phase 1 subscription infrastructure",
            trialDays: TRIAL_DAYS,
          }),
        },
      });

      console.log(`  ✓  ${user.email.padEnd(40)} → PRO TRIALING until ${trialEndsAt.toISOString().slice(0, 10)}`);
      created++;
    } catch (err) {
      console.error(`  ✗  ${user.email} — ERROR:`, err);
      failed++;
    }
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`Done. Created: ${created}  |  Failed: ${failed}  |  Skipped: ${total - created - failed}`);

  if (failed > 0) {
    console.error("Some rows failed — check errors above and re-run.");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
