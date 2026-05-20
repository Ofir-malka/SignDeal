/**
 * GET /api/contracts/[id]/verify
 *
 * Verifies the cryptographic integrity of a signed contract by recomputing
 * the SHA-256 signature digest from current contract state and comparing it
 * against the stored Contract.signatureDigest.
 *
 * ── Authentication ─────────────────────────────────────────────────────────
 * Requires a valid broker session. Returns 401 when unauthenticated.
 * A broker can only verify their own contracts — the endpoint returns 404
 * (not 403) for contracts belonging to another broker to avoid leaking
 * the existence of other brokers' contracts.
 *
 * ── Response shapes ────────────────────────────────────────────────────────
 *
 * Contract not signed / no digest stored yet:
 *   { ok: false, reason: "NO_SIGNATURE_DIGEST" }
 *
 * Digest present and matches current data:
 *   { ok: true, contractId, integrity: { valid, tampered, expectedDigest, actualDigest } }
 *
 * Digest present but does NOT match (data mutated after signing):
 *   { ok: false, reason: "CONTRACT_TAMPERED",
 *     contractId, integrity: { valid, tampered, expectedDigest, actualDigest } }
 *   + console.warn("[SIGNATURE_INTEGRITY_FAILED]", { contractId, expectedDigest, actualDigest })
 *
 * ── What is verified ───────────────────────────────────────────────────────
 * The digest covers the legal substance of the contract:
 *   contractType, dealType, propertyAddress, propertyCity, propertyPrice,
 *   commission, commissionSale, client name, broker full name, signedAt.
 *
 * Mutable operational fields (IP, UA, payment status, reminders, etc.) are
 * excluded from the digest — see lib/contracts/signature-integrity.ts.
 *
 * ── Security note ──────────────────────────────────────────────────────────
 * expectedDigest and actualDigest are returned in the response so operators
 * and audit tooling can log and compare them. They are hex-encoded SHA-256
 * strings — they contain no PII and are safe to expose to the authenticated
 * broker who owns the contract.
 */

import { NextResponse }            from "next/server";
import * as Sentry                 from "@sentry/nextjs";
import { prisma }                  from "@/lib/prisma";
import { requireUserId }           from "@/lib/require-user";
import { verifyContractIntegrity } from "@/lib/contracts/signature-integrity";
import { logAuditEvent }           from "@/lib/audit/log-audit-event";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // ── Authentication ────────────────────────────────────────────────────
    const authResult = await requireUserId();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await params;

    // ── Load contract with the relations required by verifyContractIntegrity ──
    // Select only the fields used in the digest + ownership + stored digest.
    // Never expose signatureToken, signatureIp, userAgent, or PII beyond
    // what is already visible to the owning broker.
    const contract = await prisma.contract.findUnique({
      where:  { id },
      select: {
        id:              true,
        contractType:    true,
        dealType:        true,
        propertyAddress: true,
        propertyCity:    true,
        propertyPrice:   true,
        commission:      true,
        commissionSale:  true,
        signedAt:        true,
        signatureDigest: true,
        userId:          true,   // ownership check
        client: { select: { name: true } },
        user:   { select: { fullName: true } },
      },
    });

    if (!contract) {
      return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
    }

    // ── Ownership guard ───────────────────────────────────────────────────
    // Return 404 (not 403) to avoid confirming the existence of another
    // broker's contract.
    if (contract.userId !== userId) {
      return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
    }

    // ── Legacy path: no digest stored ─────────────────────────────────────
    // Contract was signed before signature integrity was deployed.
    // Not tampered — just unverifiable.
    if (contract.signatureDigest === null) {
      return NextResponse.json(
        { ok: false, reason: "NO_SIGNATURE_DIGEST" },
        { status: 200 },
      );
    }

    // ── Verify ────────────────────────────────────────────────────────────
    const result = verifyContractIntegrity(contract);

    if (!result.valid) {
      // Log with a structured prefix so this is easy to grep in Vercel logs.
      console.warn("[SIGNATURE_INTEGRITY_FAILED]", {
        contractId:     id,
        expectedDigest: result.expectedDigest,
        actualDigest:   result.actualDigest,
      });

      Sentry.captureMessage("SIGNATURE_INTEGRITY_FAILED", {
        level: "error",
        tags:  { component: "signature_integrity" },
        extra: {
          contractId:     id,
          expectedDigest: result.expectedDigest,
          actualDigest:   result.actualDigest,
        },
      });

      // ── Audit log: integrity failure ────────────────────────────────────────
      // Awaited before the Sentry flush so all three (log + Sentry + response)
      // complete in the correct order. logAuditEvent never throws.
      await logAuditEvent({
        userId:     userId,
        action:     "contract.integrity.failed",
        entityType: "contract",
        entityId:   id,
        metadata:   {
          expectedDigest: result.expectedDigest,
          actualDigest:   result.actualDigest,
        },
      });

      // Flush before returning — serverless functions freeze immediately after
      // the response is sent, which would drop buffered Sentry events.
      await Sentry.flush(2000);

      return NextResponse.json(
        {
          ok:         false,
          reason:     "CONTRACT_TAMPERED",
          contractId: id,
          integrity:  {
            valid:          result.valid,
            tampered:       result.tampered,
            expectedDigest: result.expectedDigest,
            actualDigest:   result.actualDigest,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok:         true,
      contractId: id,
      integrity:  {
        valid:          result.valid,
        tampered:       result.tampered,
        expectedDigest: result.expectedDigest,
        actualDigest:   result.actualDigest,
      },
    });
  } catch (error) {
    console.error("[GET /api/contracts/[id]/verify]", error);
    return NextResponse.json(
      { ok: false, reason: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
