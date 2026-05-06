import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { Prisma } from "@/generated/prisma";

// ── POST /api/users/complete-profile ─────────────────────────────────────────
// Fills missing broker fields for OAuth users and sets profileComplete = true.
// Requires a valid Auth.js session.

export async function POST(request: Request) {
  const result = await requireUserId();
  if (result instanceof NextResponse) return result;
  const { userId } = result;

  const body = await request.json();
  const { fullName, phone, licenseNumber, idNumber } =
    body as Record<string, string | undefined>;

  // ── Required field validation ─────────────────────────────────────────────
  const missing: string[] = [];
  if (!fullName?.trim())      missing.push("fullName");
  if (!phone?.trim())         missing.push("phone");
  if (!licenseNumber?.trim()) missing.push("licenseNumber");
  if (!idNumber?.trim())      missing.push("idNumber");

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "שדות חסרים", fields: missing },
      { status: 400 },
    );
  }

  // ── licenseNumber uniqueness — exclude current user ───────────────────────
  // Allows safe re-submit: user can call this endpoint again with the same value.
  const licenseConflict = await prisma.user.findFirst({
    where: { licenseNumber: licenseNumber!.trim(), NOT: { id: userId } },
  });
  if (licenseConflict) {
    return NextResponse.json(
      { error: "מספר רישיון כבר קיים במערכת" },
      { status: 409 },
    );
  }

  // ── Update ────────────────────────────────────────────────────────────────
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName:        fullName!.trim(),
        phone:           phone!.trim(),
        licenseNumber:   licenseNumber!.trim(),
        idNumber:        idNumber!.trim(),
        profileComplete: true,
      },
      select: {
        id:              true,
        fullName:        true,
        email:           true,
        phone:           true,
        licenseNumber:   true,
        profileComplete: true,
      },
    });

    return NextResponse.json(user, { status: 200 });

  } catch (error) {
    // P2002 — unique constraint violation on licenseNumber (concurrent race)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "מספר רישיון כבר קיים במערכת" },
        { status: 409 },
      );
    }
    console.error("[POST /api/users/complete-profile]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
