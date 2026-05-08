import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const clients = await prisma.client.findMany({
      where:   { userId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clients);
  } catch (error) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    // ── Rate limit: 30 client creations per broker per hour ───────────────────
    const rl = rateLimit(userId, "client-create", { max: 30, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי לקוחות — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await req.json();
    const name     = String(body.name     ?? "").trim();
    const phone    = String(body.phone    ?? "").trim();
    const email    = String(body.email    ?? "").trim();
    const idNumber = String(body.idNumber ?? "").trim();

    if (!name)  return NextResponse.json({ error: "שם הוא שדה חובה"    }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "טלפון הוא שדה חובה" }, { status: 400 });

    // Application-level uniqueness: one client per phone per broker
    const existing = await prisma.client.findFirst({ where: { phone, userId } });
    if (existing) {
      return NextResponse.json(
        { error: "לקוח עם מספר טלפון זה כבר קיים במערכת" },
        { status: 409 },
      );
    }

    const client = await prisma.client.create({
      data: {
        name,
        phone,
        // email/idNumber are non-nullable String in schema — keep as "" when empty
        email:    email    || "",
        idNumber: idNumber || "",
        // Use Prisma relation connect instead of scalar userId to satisfy v7 validation
        user: { connect: { id: userId } },
      },
    });
    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients]", error);
    return NextResponse.json({ error: "שגיאה ביצירת הלקוח" }, { status: 500 });
  }
}
