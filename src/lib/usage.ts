/**
 * usage.ts
 *
 * Runtime usage helpers for plan limit enforcement.
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • Single Prisma query per check — no N+1, no caching complexity.
 * • "Monthly usage" = contracts with createdAt >= first day of the current
 *   UTC calendar month. This is the dimension enforced against plan limits.
 *   When a billing provider is connected, switch to currentPeriodStart alignment
 *   instead (revisit in Phase 4).
 * • No plan logic lives here — import getEffectivePlan / getMonthlyDocLimit
 *   from plans.ts for that.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import { getMonthlyDocumentUsage } from "@/lib/usage";
 *
 *   const count = await getMonthlyDocumentUsage(userId);
 */

import { prisma } from "@/lib/prisma";

/**
 * Returns the number of contracts the user has created in the current
 * UTC calendar month (1st of month 00:00:00 UTC → now).
 *
 * All Contract rows are counted regardless of status — a CANCELED contract
 * still consumed a document slot for that month.
 *
 * @example
 *   const count = await getMonthlyDocumentUsage(userId);
 */
export async function getMonthlyDocumentUsage(userId: string): Promise<number> {
  const now          = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return prisma.contract.count({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
  });
}
