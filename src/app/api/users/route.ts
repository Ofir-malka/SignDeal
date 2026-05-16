import { NextResponse, after } from "next/server";
import { prisma }              from "@/lib/prisma";
import bcrypt                  from "bcryptjs";
import { rateLimit, getRealIp } from "@/lib/rate-limit";
import { sendEmail, welcomeEmail } from "@/lib/email";

// ── POST /api/users ───────────────────────────────────────────────────────────
// Creates a broker user profile with hashed password.
// Public endpoint — no auth required for registration.

export async function POST(request: Request) {
  // ── Rate limit: max 10 registration attempts per IP per hour ─────────────────
  const ip = getRealIp(request);
  const rl = rateLimit(ip, "register", { max: 10, windowMs: 3_600_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "יותר מדי בקשות — נסה שוב מאוחר יותר" },
      {
        status:  429,
        headers: { "Retry-After": String(rl.retryAfter) },
      },
    );
  }

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

    // ── Create user + subscription atomically ─────────────────────────────────
    // The transaction guarantees that no user ever exists without a Subscription
    // row. If either insert fails the whole registration is rolled back.
    const passwordHash = await bcrypt.hash(password!.trim(), 10);

    const user = await prisma.$transaction(async (tx) => {
      // 1. Create the user
      const newUser = await tx.user.create({
        data: {
          fullName:      fullName!.trim(),
          email:         email!.trim(),
          phone:         phone!.trim(),
          licenseNumber: licenseNumber!.trim(),
          idNumber:      idNumber!.trim(),
          logoUrl:         logoUrl?.trim() || null,
          passwordHash,
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

      // 2. Create the subscription — Phase 2B: start as INCOMPLETE (no card yet).
      // trialEndsAt is NOT set here; it will be set by the billing success webhook
      // when the user provides a card and the 14-day trial clock starts.
      const subscription = await tx.subscription.create({
        data: {
          userId: newUser.id,
          plan:   "STANDARD",
          status: "INCOMPLETE",
        },
      });

      // 3. Record the audit event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          event:          "account_created",
          fromPlan:       null,
          toPlan:         "STANDARD",
          fromStatus:     null,
          toStatus:       "INCOMPLETE",
          source:         "registration",
          actorId:        null,
          metadata:       JSON.stringify({ note: "card_required_to_start_trial" }),
        },
      });

      return newUser;
    });

    // Schedule the welcome email + Message audit record AFTER the 201 response
    // is flushed. after() keeps the Vercel function alive until the callback
    // resolves, so neither the send nor the audit write is silently dropped.
    // Any failure inside the callback is caught and logged — registration is
    // already confirmed and must never be rolled back by a notification error.
    // TODO(queue): Replace after() with a durable job queue once retry-on-failure
    //   or open-rate tracking is required for welcome emails.
    console.log(`[POST /api/users] user created id=${user.id} — welcome email queued via after()`);
    after(async () => {
      try {
        const template = welcomeEmail({ fullName: user.fullName });

        // Create PENDING record before the network call so a crash mid-flight
        // still leaves an auditable row. userId is the only context available
        // for registration emails (no contractId / clientId / paymentId).
        const message = await prisma.message.create({
          data: {
            type:           "USER_WELCOME",
            channel:        "EMAIL",
            provider:       "resend",
            subject:        template.subject,
            body:           template.text,
            userId:         user.id,
            recipientEmail: user.email!,
            status:         "PENDING",
            attempts:       0,
          },
        });

        const result = await sendEmail({ to: user.email!, ...template });

        await prisma.message.update({
          where: { id: message.id },
          data: result.ok
            ? {
                status:            "SENT",
                providerMessageId: result.messageId ?? null,
                attempts:          1,
                lastAttemptAt:     new Date(),
              }
            : {
                status:        "FAILED",
                failureReason: result.reason,
                attempts:      1,
                lastAttemptAt: new Date(),
              },
        });

        if (result.ok) {
          console.log(`[POST /api/users] welcome email sent — messageId=${result.messageId ?? "n/a"}`);
        } else {
          console.error(`[POST /api/users] welcome email failed — reason=${result.reason}`);
        }
      } catch (err) {
        // Never let an email or audit error surface after the response has been sent.
        console.error("[POST /api/users] welcome email unexpected error:", err instanceof Error ? err.message : String(err));
      }
    });

    return NextResponse.json(user, { status: 201 });

  } catch (error) {
    console.error("[POST /api/users]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
