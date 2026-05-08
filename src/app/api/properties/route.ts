import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const properties = await prisma.property.findMany({
      where:   { userId },
      include: { _count: { select: { contracts: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(properties);
  } catch (error) {
    console.error("[GET /api/properties]", error);
    return NextResponse.json({ error: "Failed to fetch properties" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    // ── Rate limit: 20 property creations per broker per hour ─────────────────
    const rl = rateLimit(userId, "property-create", { max: 20, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי נכסים — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await request.json();
    const { address, city, type, listingType, rooms, floor, sizeSqm, askingPrice } = body;

    if (!address || !city || !type) {
      return NextResponse.json(
        { error: "Missing required fields: address, city, type" },
        { status: 400 }
      );
    }

    const property = await prisma.property.create({
      data: {
        userId,
        address,
        city,
        type,
        listingType: listingType || "RENTAL",
        rooms:       rooms       != null ? Number(rooms)       : null,
        floor:       floor       != null ? Number(floor)       : null,
        sizeSqm:     sizeSqm     != null ? Number(sizeSqm)     : null,
        askingPrice: askingPrice != null ? Number(askingPrice) : null,
      },
      include: { _count: { select: { contracts: true } } },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error("[POST /api/properties]", error);
    return NextResponse.json({ error: "Failed to create property" }, { status: 500 });
  }
}
