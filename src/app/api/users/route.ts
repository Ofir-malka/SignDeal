import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendEmail } from "@/lib/messaging/email-provider";

async function sendWelcomeEmail(fullName: string, email: string): Promise<void> {
  console.log(`[sendWelcomeEmail] sending to=${email}`);
  try {
    const result = await sendEmail({
      to:      email,
      subject: "ברוך הבא ל-SignDeal!",
      text:    `שלום ${fullName},\n\nחשבונך ב-SignDeal נוצר בהצלחה.\nמעכשיו תוכל לנהל חוזים, לקוחות ותשלומים בקלות.\n\nצוות SignDeal`,
      html:    `<p>שלום ${fullName},</p><p>חשבונך ב-SignDeal נוצר בהצלחה.<br>מעכשיו תוכל לנהל חוזים, לקוחות ותשלומים בקלות.</p><p>צוות SignDeal</p>`,
    });
    if (result.ok) {
      console.log(`[sendWelcomeEmail] sent ok — messageId=${result.messageId ?? "n/a"}`);
    } else {
      console.error(`[sendWelcomeEmail] failed — reason=${result.reason}`);
    }
  } catch (err) {
    console.error("[sendWelcomeEmail] unexpected error:", err);
  }
}

// ── POST /api/users ───────────────────────────────────────────────────────────
// Creates a broker user profile with hashed password.
// Public endpoint — no auth required for registration.

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      fullName,
      email,
      phone,
      licenseNumber,
      idNumber,
      logoUrl,
      password,
    } = body as Record<string, string | undefined>;

    // ── Required field validation ─────────────────────────────────────────────
    const missing: string[] = [];
    if (!fullName?.trim())                                missing.push("fullName");
    if (!email?.trim())                                   missing.push("email");
    if (!phone?.trim())                                   missing.push("phone");
    if (!licenseNumber?.trim())                           missing.push("licenseNumber");
    if (!idNumber?.trim())                                missing.push("idNumber");
    if (!password?.trim() || password.trim().length < 8) missing.push("password");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: "שדות חסרים", fields: missing },
        { status: 400 },
      );
    }

    // ── Unique conflict checks ────────────────────────────────────────────────
    const [emailConflict, licenseConflict] = await Promise.all([
      prisma.user.findUnique({ where: { email: email! } }),
      prisma.user.findFirst({ where: { licenseNumber: licenseNumber! } }),
    ]);

    if (emailConflict) {
      return NextResponse.json({ error: "אימייל כבר רשום" }, { status: 409 });
    }
    if (licenseConflict) {
      return NextResponse.json({ error: "מספר רישיון כבר קיים במערכת" }, { status: 409 });
    }

    // ── Create ────────────────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        fullName:      fullName!.trim(),
        email:         email!.trim(),
        phone:         phone!.trim(),
        licenseNumber: licenseNumber!.trim(),
        idNumber:      idNumber!.trim(),
        logoUrl:         logoUrl?.trim() || null,
        passwordHash:    await bcrypt.hash(password!.trim(), 10),
        profileComplete: true,
      },
      // idNumber excluded from response — treated as sensitive
      select: {
        id:            true,
        fullName:      true,
        email:         true,
        phone:         true,
        licenseNumber: true,
        logoUrl:       true,
        createdAt:     true,
      },
    });

    // await (not void) — Vercel may kill the container before a detached promise runs.
    // sendWelcomeEmail catches all errors internally, so this never blocks the 201.
    console.log(`[POST /api/users] user created id=${user.id} — calling sendWelcomeEmail`);
    await sendWelcomeEmail(fullName!.trim(), email!.trim());
    console.log(`[POST /api/users] sendWelcomeEmail returned — responding 201`);

    return NextResponse.json(user, { status: 201 });

  } catch (error) {
    console.error("[POST /api/users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
