import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { requireUserId } from "@/lib/require-user";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await context.params;
    const contract = await prisma.contract.findFirst({
      where: { id, userId },
      include: {
        client: true,
        payment: true,
        activities: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }
    return NextResponse.json(contract);
  } catch (error) {
    console.error("[GET /api/contracts/:id]", error);
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await context.params;

    // Verify ownership before any update
    const owned = await prisma.contract.findFirst({ where: { id, userId } });
    if (!owned) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const body = await request.json();
    const { signatureStatus, dealClosed, signedAt, dealClosedAt, clientEmail, clientIdNumber, signatureData, signatureHash } = body;

    // Validate signature data size before processing
    if (signatureData !== undefined && typeof signatureData === "string" && signatureData.length > 500_000) {
      return NextResponse.json({ error: "Signature data too large" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (signatureStatus  !== undefined) data.status       = signatureStatus;
    if (dealClosed       !== undefined) data.dealClosed   = Boolean(dealClosed);
    if (signedAt         !== undefined) data.signedAt     = signedAt     ? new Date(signedAt)     : null;
    if (dealClosedAt     !== undefined) data.dealClosedAt = dealClosedAt ? new Date(dealClosedAt) : null;

    // Capture full audit trail when signing
    if (signatureStatus === "SIGNED") {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim()
        ?? request.headers.get("x-real-ip")
        ?? null;
      const ua = request.headers.get("user-agent") ?? null;

      data.signatureIp = ip;
      data.userAgent   = ua;
      if (typeof signatureData === "string") data.signatureData = signatureData;
      if (typeof signatureHash === "string") data.signatureHash = signatureHash;

      // Temporary: log audit data for verification
      console.log("[SIGN AUDIT]", {
        contractId:  id,
        signatureIp: ip,
        userAgent:   ua,
        hasSignatureData: data.signatureData !== null,
        signatureHash:    data.signatureHash,
      });
    }

    const clientData: Record<string, string> = {};
    if (clientEmail    !== undefined) clientData.email    = clientEmail;
    if (clientIdNumber !== undefined) clientData.idNumber = clientIdNumber;
    if (Object.keys(clientData).length > 0) data.client = { update: clientData };

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const contract = await prisma.contract.update({
      where: { id },
      data,
      include: { client: true, payment: true },
    });
    return NextResponse.json(contract);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }
    console.error("[PATCH /api/contracts/:id]");
    console.error(error);
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await context.params;

    // Verify ownership before deleting
    const owned = await prisma.contract.findFirst({ where: { id, userId } });
    if (!owned) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.activity.deleteMany({ where: { contractId: id } }),
      prisma.message.deleteMany({ where: { contractId: id } }),
      prisma.payment.deleteMany({ where: { contractId: id } }),
      prisma.contract.delete({ where: { id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }
    console.error("[DELETE ERROR]", error);
    return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
  }
}
