/**
 * GET /api/admin/billing/overview
 *
 * Admin-only endpoint. Returns a single JSON payload covering:
 *   - KPIs: subscription counts, revenue, upcoming renewals, failed charges
 *   - latestCharges: last 20 BillingCharge rows (any status)
 *   - failedCharges: last 20 FAILED BillingCharge rows with retry state
 *
 * Auth: requireAdmin() — DB role check on every request; JWT alone is not trusted.
 *
 * ── No pagination, caching, or frontend yet ────────────────────────────────────
 * This is the stable data contract for the future admin billing dashboard UI.
 * The response shape is intentionally fixed — do not reorder or remove fields.
 *
 * ── Data access notes ──────────────────────────────────────────────────────────
 * BillingCharge has a denormalized userId but no direct User relation in the
 * schema. User fields are always fetched via subscription.user to avoid a
 * second round-trip or a raw SQL join.
 *
 * ── Manual trigger ─────────────────────────────────────────────────────────────
 *   curl https://www.signdeal.co.il/api/admin/billing/overview \
 *     -H "Cookie: next-auth.session-token=<admin-session>"
 */

import { NextResponse }  from "next/server";
import { prisma }        from "@/lib/prisma";
import { requireAdmin }  from "@/lib/require-admin";

// ── Response types ────────────────────────────────────────────────────────────

interface BillingKpis {
  activeSubscriptions:       number;
  trialingSubscriptions:     number;
  /**
   * Escalated subscriptions — status = PAST_DUE OR billingFailures >= 3.
   * Covers both the normal path (cron sets PAST_DUE after 3 failures) and any
   * edge case where billingFailures reached 3 before status was written.
   */
  escalatedSubscriptions:    number;
  failedChargesLast30Days:   number;
  monthlyRevenueAgorot:      number;
  upcomingRenewalsNext7Days: number;
  /**
   * Warning-state subscriptions — ACTIVE or TRIALING with billingFailures IN (1, 2).
   * These users had 1–2 charge failures but are still recoverable (not yet suspended).
   * Explicitly excludes billingFailures = 0 (healthy) and >= 3 (already escalated).
   */
  billingWarningSubscriptions: number;
}

interface ChargeUser {
  id:    string;
  email: string;
  name:  string;
}

interface ChargeSubscriptionBasic {
  id:   string;
  plan: string;
}

interface LatestCharge {
  id:           string;
  status:       string;
  amountAgorot: number;
  hypCCode:     string | null;
  hypAuthCode:  string | null;
  createdAt:    string;            // ISO-8601
  subscription: ChargeSubscriptionBasic;
  user:         ChargeUser;
}

interface ChargeSubscriptionWithRetry extends ChargeSubscriptionBasic {
  billingFailures: number;
  nextBillingAt:   string | null;  // ISO-8601 or null
  status:          string;
}

interface FailedCharge {
  id:           string;
  amountAgorot: number;
  hypCCode:     string | null;
  createdAt:    string;            // ISO-8601
  subscription: ChargeSubscriptionWithRetry;
  user:         ChargeUser;
}

interface BillingOverviewResponse {
  kpis:           BillingKpis;
  latestCharges:  LatestCharge[];
  failedCharges:  FailedCharge[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(_request: Request): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  const now            = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysOut   = new Date(now.getTime() +  7 * 24 * 60 * 60 * 1000);

  try {
    // ── KPIs + lists in parallel ────────────────────────────────────────────
    // All 8 queries fire concurrently — single round-trip budget.
    const [
      activeCount,
      trialingCount,
      pastDueCount,
      failedCount,
      revenueAgg,
      renewalsCount,
      latestChargesRaw,
      failedChargesRaw,
      billingWarningCount,
    ] = await Promise.all([

      // 1. Active subscriptions
      prisma.subscription.count({
        where: { status: "ACTIVE" },
      }),

      // 2. Trialing subscriptions
      prisma.subscription.count({
        where: { status: "TRIALING" },
      }),

      // 3. Escalated subscriptions: status = PAST_DUE OR billingFailures >= 3.
      // The OR guard catches any subscription that reached 3 failures but whose
      // status update lagged (e.g. partial cron crash between the two DB writes).
      prisma.subscription.count({
        where: {
          OR: [
            { status: "PAST_DUE" },
            { billingFailures: { gte: 3 } },
          ],
        },
      }),

      // 4. Failed charges in last 30 days
      prisma.billingCharge.count({
        where: {
          status:    "FAILED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // 5. Monthly revenue — sum of SUCCEEDED charges in last 30 days
      prisma.billingCharge.aggregate({
        _sum: { amountAgorot: true },
        where: {
          status:    "SUCCEEDED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // 6. Upcoming renewals in next 7 days
      // Counts subscriptions with nextBillingAt in [now, now+7d]
      // Any chargeable status (TRIALING, ACTIVE, PAST_DUE).
      prisma.subscription.count({
        where: {
          nextBillingAt: { gte: now, lte: sevenDaysOut },
          status:        { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
        },
      }),

      // 7. Latest 20 charges (any status)
      prisma.billingCharge.findMany({
        take:    20,
        orderBy: { createdAt: "desc" },
        select: {
          id:          true,
          status:      true,
          amountAgorot: true,
          hypCCode:    true,
          hypAuthCode: true,
          createdAt:   true,
          subscription: {
            select: {
              id:   true,
              plan: true,
              user: {
                select: {
                  id:       true,
                  email:    true,
                  fullName: true,
                },
              },
            },
          },
        },
      }),

      // 8. Latest 20 FAILED charges with retry state
      prisma.billingCharge.findMany({
        take:    20,
        orderBy: { createdAt: "desc" },
        where:   { status: "FAILED" },
        select: {
          id:          true,
          amountAgorot: true,
          hypCCode:    true,
          createdAt:   true,
          subscription: {
            select: {
              id:              true,
              plan:            true,
              status:          true,
              billingFailures: true,
              nextBillingAt:   true,
              user: {
                select: {
                  id:       true,
                  email:    true,
                  fullName: true,
                },
              },
            },
          },
        },
      }),

      // 9. Warning-state subscriptions: ACTIVE or TRIALING with billingFailures IN (1, 2).
      // lte: 2 explicitly excludes billingFailures = 3, which should be PAST_DUE
      // but might not be if the cron status-write hasn't run yet.
      prisma.subscription.count({
        where: {
          status:          { in: ["ACTIVE", "TRIALING"] },
          billingFailures: { gte: 1, lte: 2 },
        },
      }),
    ]);

    // ── Map KPIs ──────────────────────────────────────────────────────────────
    const kpis: BillingKpis = {
      activeSubscriptions:         activeCount,
      trialingSubscriptions:       trialingCount,
      escalatedSubscriptions:      pastDueCount,   // variable reused; query now covers PAST_DUE OR failures>=3
      failedChargesLast30Days:     failedCount,
      monthlyRevenueAgorot:        revenueAgg._sum.amountAgorot ?? 0,
      upcomingRenewalsNext7Days:   renewalsCount,
      billingWarningSubscriptions: billingWarningCount,
    };

    // ── Map latestCharges ─────────────────────────────────────────────────────
    // subscription.user is always present (FK enforced); guard anyway.
    const latestCharges: LatestCharge[] = latestChargesRaw.map((c) => ({
      id:           c.id,
      status:       c.status,
      amountAgorot: c.amountAgorot,
      hypCCode:     c.hypCCode,
      hypAuthCode:  c.hypAuthCode,
      createdAt:    c.createdAt.toISOString(),
      subscription: {
        id:   c.subscription.id,
        plan: c.subscription.plan,
      },
      user: {
        id:    c.subscription.user.id,
        email: c.subscription.user.email,
        name:  c.subscription.user.fullName,
      },
    }));

    // ── Map failedCharges ─────────────────────────────────────────────────────
    const failedCharges: FailedCharge[] = failedChargesRaw.map((c) => ({
      id:           c.id,
      amountAgorot: c.amountAgorot,
      hypCCode:     c.hypCCode,
      createdAt:    c.createdAt.toISOString(),
      subscription: {
        id:              c.subscription.id,
        plan:            c.subscription.plan,
        status:          c.subscription.status,
        billingFailures: c.subscription.billingFailures,
        nextBillingAt:   c.subscription.nextBillingAt?.toISOString() ?? null,
      },
      user: {
        id:    c.subscription.user.id,
        email: c.subscription.user.email,
        name:  c.subscription.user.fullName,
      },
    }));

    // ── Assemble + return ─────────────────────────────────────────────────────
    const payload: BillingOverviewResponse = {
      kpis,
      latestCharges,
      failedCharges,
    };

    return NextResponse.json(payload);

  } catch (err) {
    console.error(
      "[GET /api/admin/billing/overview] ERROR:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Failed to load billing overview — check server logs" },
      { status: 500 },
    );
  }
}
