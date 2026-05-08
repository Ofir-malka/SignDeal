import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { rateLimit } from "@/lib/rate-limit";
import {
  parseEnum,
  parseOptionalPositiveFloat,
  parseOptionalInt,
  parseOptionalPositiveInt,
  firstError,
} from "@/lib/validate";

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

    if (!address || !city) {
      return NextResponse.json(
        { error: "כתובת ועיר הם שדות חובה" },
        { status: 400 }
      );
    }

    // ── Enum + numeric validation ─────────────────────────────────────────────
    const PROPERTY_TYPES  = ["APARTMENT", "HOUSE", "OFFICE", "LAND", "PARKING", "OTHER"] as const;
    const LISTING_TYPES   = ["RENTAL", "SALE", "BOTH"] as const;
    const vType        = parseEnum(type,               PROPERTY_TYPES, "סוג נכס");
    const vListingType = parseEnum(listingType ?? "RENTAL", LISTING_TYPES, "סוג מודעה");
    const vRooms       = parseOptionalPositiveFloat(rooms,       "חדרים");
    const vFloor       = parseOptionalInt(floor,                 "קומה");
    const vSizeSqm     = parseOptionalPositiveFloat(sizeSqm,     "שטח במ״ר");
    const vAskingPrice = parseOptionalPositiveInt(askingPrice,   "מחיר מבוקש");
    const validationError = firstError(vType, vListingType, vRooms, vFloor, vSizeSqm, vAskingPrice);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    // Narrowing: all Results are Ok beyond this point
    if (!vType.ok || !vListingType.ok || !vRooms.ok || !vFloor.ok || !vSizeSqm.ok || !vAskingPrice.ok) {
      return NextResponse.json({ error: "Validation error" }, { status: 400 });
    }

    const property = await prisma.property.create({
      data: {
        userId,
        address,
        city,
        type:        vType.value,
        listingType: vListingType.value,
        rooms:       vRooms.value       ?? null,
        floor:       vFloor.value       ?? null,
        sizeSqm:     vSizeSqm.value     ?? null,
        askingPrice: vAskingPrice.value ?? null,
      },
      include: { _count: { select: { contracts: true } } },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error("[POST /api/properties]", error);
    return NextResponse.json({ error: "Failed to create property" }, { status: 500 });
  }
}
