/**
 * usage.ts
 *
 * Runtime usage helpers for plan limit enforcement.
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 * • Single Prisma query per check — no N+1, no caching complexity.
 * • "Monthly usage" = ContractUsageEvent rows with createdAt >= first day of
 *   the current UTC calendar month. See ContractUsageEvent in schema.prisma.
 *
 *   WHY NOT Contract rows: deleting a Contract hard-removes its row, which would
 *   drop the usage count and let users bypass monthly limits by creating and
 *   then deleting contracts.  ContractUsageEvent is immutable — contract deletion
 *   sets contractId to null (onDelete: SetNull) but keeps the event row, so the
 *   count is always accurate regardless of whether the contract still exists.
 *
 *   Previous implementation (Contract.count) is replaced as of the migration
 *   20260517153110_add_contract_usage_event.  Existing contracts were backfilled
 *   into ContractUsageEvent in that migration so historical counts are preserved.
 *
 * • When a billing provider is connected, switch to currentPeriodStart alignment
 *   instead of calendar-month alignment (revisit in Phase 4).
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
 * Returns the number of document slots consumed by the user in the current
 * UTC calendar month (1st of month 00:00:00 UTC → now).
 *
 * Counts ContractUsageEvent rows — NOT live Contract rows.
 * Deleting a contract does not reduce this count.
 *
 * @example
 *   const count = await getMonthlyDocumentUsage(userId);
 */
export async function getMonthlyDocumentUsage(userId: string): Promise<number> {
  const now          = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return prisma.contractUsageEvent.count({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
  });
}
