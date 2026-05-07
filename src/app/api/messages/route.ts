/**
 * GET /api/messages
 *
 * Returns the broker's recent outgoing notification records (last 100).
 * Useful for auditing failed messages and debugging delivery issues.
 *
 * Query params (all optional):
 *   status  — filter by MessageStatus: PENDING | SENT | DELIVERED | FAILED | CANCELED
 *   type    — filter by MessageType
 *   limit   — max rows to return (default 100, max 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

export async function GET(req: NextRequest) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") ?? undefined;
    const typeFilter   = searchParams.get("type")   ?? undefined;
    const rawLimit     = parseInt(searchParams.get("limit") ?? "100", 10);
    const limit        = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 200);

    const messages = await prisma.message.findMany({
      where: {
        userId,
        ...(statusFilter ? { status: statusFilter as "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELED" } : {}),
        ...(typeFilter   ? { type:   typeFilter   as "CONTRACT_SIGNING_LINK" | "PAYMENT_REQUEST_LINK" | "SIGNING_REMINDER" | "PAYMENT_REMINDER" | "BROKER_CONTRACT_SIGNED" | "BROKER_PAYMENT_RECEIVED" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
      include: {
        contract: {
          select: { contractType: true, propertyAddress: true, propertyCity: true },
        },
      },
    });

    // Attach a summary of failure counts for quick dashboard display
    const failedCount  = await prisma.message.count({ where: { userId, status: "FAILED"  } });
    const pendingCount = await prisma.message.count({ where: { userId, status: "PENDING" } });

    return NextResponse.json({
      messages,
      summary: {
        failedCount,
        pendingCount,
        returnedCount: messages.length,
        limit,
      },
    });
  } catch (error) {
    console.error("[GET /api/messages]", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
