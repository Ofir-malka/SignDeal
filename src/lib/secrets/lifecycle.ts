/**
 * src/lib/secrets/lifecycle.ts
 *
 * Lifecycle-integrity jobs for EncryptedSecret. Mirrors the billing sweeper /
 * watchdog conventions (env-tunable window, per-row guard, audit, Sentry summary).
 *
 * ⚠ PHASE 1: these are FOUNDATION functions only. They are NOT wired to any cron,
 * route, or runtime path, and they no-op while the tables are empty. No payment
 * behavior. Wiring to a schedule is a later phase.
 *
 *   runOrphanSecretSweeper()      — crypto-shreds non-purged secrets whose owner
 *                                   row no longer exists (safety net for any
 *                                   owner-delete path that forgot to call
 *                                   purgeSecretsForOwner).
 *   runDanglingSecretRefDetector()— alert-first: finds owner *SecretRef handles
 *                                   pointing at a missing/purged secret.
 *
 * Env vars:
 *   SECRET_ORPHAN_SWEEPER_GRACE_MINUTES  grace beyond createdAt before a row is
 *                                        eligible (default 60) — avoids racing
 *                                        in-flight creates.
 *   SECRET_DANGLING_REMEDIATE            "true" to null dangling refs; default
 *                                        off (alert-only).
 */

import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";
import { logAuditEvent } from "@/lib/audit/log-audit-event";

const GRACE_MINUTES: number = (() => {
  const v = parseInt(process.env.SECRET_ORPHAN_SWEEPER_GRACE_MINUTES ?? "", 10);
  return isNaN(v) || v < 0 ? 60 : v;
})();

const REMEDIATE_DANGLING = process.env.SECRET_DANGLING_REMEDIATE === "true";

/** ownerType → existence check for that owner's row id. */
async function ownerExists(ownerType: string, ownerId: string): Promise<boolean> {
  switch (ownerType) {
    case "GrowBrokerMerchant":
      return (await prisma.growBrokerMerchant.count({ where: { id: ownerId } })) > 0;
    case "Subscription":
      return (await prisma.subscription.count({ where: { id: ownerId } })) > 0;
    case "GrowOnboardingSession":
      return (await prisma.growOnboardingSession.count({ where: { id: ownerId } })) > 0;
    case "Payment":
      return (await prisma.payment.count({ where: { id: ownerId } })) > 0;
    default:
      // Unknown ownerType → treat as "exists" to avoid over-purging on a typo.
      return true;
  }
}

// ── Orphan-secret sweeper ────────────────────────────────────────────────────

export interface OrphanSweeperResult {
  ranAt: string;
  scanned: number;
  purged: number;
  failed: number;
}

export async function runOrphanSecretSweeper(): Promise<OrphanSweeperResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);

  const candidates = await prisma.encryptedSecret.findMany({
    where: { purgedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, ownerType: true, ownerId: true, purpose: true, rail: true },
  });

  let purged = 0;
  let failed = 0;

  for (const row of candidates) {
    try {
      if (await ownerExists(row.ownerType, row.ownerId)) continue;

      // Confirmed orphan → crypto-shred (idempotent guard on purgedAt: null).
      const { count } = await prisma.encryptedSecret.updateMany({
        where: { id: row.id, purgedAt: null },
        data: { purgedAt: new Date(), ciphertext: null },
      });
      if (count === 0) continue; // raced with another purge

      purged++;
      await logAuditEvent({
        userId: null,
        action: "secret.orphan_purged",
        entityType: "encryptedSecret",
        entityId: row.id,
        metadata: {
          encRef: row.id,
          purpose: row.purpose,
          rail: row.rail,
          ownerType: row.ownerType,
          ownerId: row.ownerId,
        },
      });
    } catch (err) {
      failed++;
      Sentry.captureException(err, {
        tags: { component: "secret_orphan_sweeper" },
        level: "error",
        extra: { encRef: row.id, ownerType: row.ownerType },
      });
    }
  }

  if (failed > 0) {
    Sentry.captureMessage(
      `[secret-orphan-sweeper] ${failed} row(s) failed to purge`,
      {
        level: "warning",
        tags: { component: "secret_orphan_sweeper" },
        extra: { scanned: candidates.length, purged, failed },
      },
    );
  }

  return { ranAt: now.toISOString(), scanned: candidates.length, purged, failed };
}

// ── Dangling-ref detector ────────────────────────────────────────────────────

export interface DanglingRef {
  ownerType: string;
  ownerId: string;
  refField: string;
  encRef: string;
}

export interface DanglingDetectorResult {
  ranAt: string;
  checked: number;
  dangling: number;
  remediated: number;
}

/** True if the referenced secret is missing or purged. */
async function isDangling(secretRef: string): Promise<boolean> {
  const row = await prisma.encryptedSecret.findUnique({
    where: { id: secretRef },
    select: { purgedAt: true },
  });
  return !row || row.purgedAt !== null;
}

export async function runDanglingSecretRefDetector(): Promise<DanglingDetectorResult> {
  const now = new Date();
  const dangling: DanglingRef[] = [];
  let checked = 0;

  const merchants = await prisma.growBrokerMerchant.findMany({
    where: { apiKeySecretRef: { not: null } },
    select: { id: true, apiKeySecretRef: true },
  });
  for (const m of merchants) {
    checked++;
    if (m.apiKeySecretRef && (await isDangling(m.apiKeySecretRef))) {
      dangling.push({
        ownerType: "GrowBrokerMerchant",
        ownerId: m.id,
        refField: "apiKeySecretRef",
        encRef: m.apiKeySecretRef,
      });
    }
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { growSaasChargeSecretRef: { not: null } },
    select: { id: true, growSaasChargeSecretRef: true },
  });
  for (const s of subscriptions) {
    checked++;
    if (s.growSaasChargeSecretRef && (await isDangling(s.growSaasChargeSecretRef))) {
      dangling.push({
        ownerType: "Subscription",
        ownerId: s.id,
        refField: "growSaasChargeSecretRef",
        encRef: s.growSaasChargeSecretRef,
      });
    }
  }

  const sessions = await prisma.growOnboardingSession.findMany({
    where: { leadSecretRef: { not: null } },
    select: { id: true, leadSecretRef: true },
  });
  for (const sess of sessions) {
    checked++;
    if (sess.leadSecretRef && (await isDangling(sess.leadSecretRef))) {
      dangling.push({
        ownerType: "GrowOnboardingSession",
        ownerId: sess.id,
        refField: "leadSecretRef",
        encRef: sess.leadSecretRef,
      });
    }
  }

  let remediated = 0;
  if (dangling.length > 0) {
    Sentry.captureMessage(
      `[secret-dangling-detector] ${dangling.length} dangling secret ref(s)`,
      {
        level: "error",
        tags: { component: "secret_dangling_detector", security: "true" },
        extra: { checked, dangling: dangling.length },
      },
    );

    // Remediation is gated behind a flag (default OFF — alert-only).
    if (REMEDIATE_DANGLING) {
      for (const d of dangling) {
        try {
          if (d.refField === "apiKeySecretRef") {
            await prisma.growBrokerMerchant.update({
              where: { id: d.ownerId },
              data: { apiKeySecretRef: null, isActive: false },
            });
          } else if (d.refField === "growSaasChargeSecretRef") {
            await prisma.subscription.update({
              where: { id: d.ownerId },
              data: { growSaasChargeSecretRef: null },
            });
          } else if (d.refField === "leadSecretRef") {
            await prisma.growOnboardingSession.update({
              where: { id: d.ownerId },
              data: { leadSecretRef: null },
            });
          }
          remediated++;
          await logAuditEvent({
            userId: null,
            action: "secret.dangling_ref_remediated",
            entityType: d.ownerType,
            entityId: d.ownerId,
            metadata: { refField: d.refField, encRef: d.encRef },
          });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: "secret_dangling_detector" },
            level: "error",
            extra: { ownerType: d.ownerType, ownerId: d.ownerId, refField: d.refField },
          });
        }
      }
    }
  }

  return { ranAt: now.toISOString(), checked, dangling: dangling.length, remediated };
}
