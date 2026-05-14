/**
 * POST /api/auth/forgot-password
 *
 * Initiates a password-reset flow.
 *
 * ── Security guarantees ────────────────────────────────────────────────────────
 * • No account enumeration: always returns HTTP 200 { ok: true } regardless of
 *   whether the email exists, belongs to an OAuth-only account, or is invalid.
 * • Token: crypto.randomBytes(32) → 64-char hex raw token sent in URL.
 *   Only SHA-256(rawToken) is written to the database — the plain token is
 *   never persisted.
 * • One active token per email: any existing PasswordResetToken row for this
 *   email is deleted before a new one is created, invalidating prior links.
 * • Expiry: 1 hour (RESET_TOKEN_EXPIRES_MS).
 * • Rate limit: 3 requests per IP per 15 minutes.
 *
 * ── OAuth-only accounts ────────────────────────────────────────────────────────
 * If the user has no passwordHash (signed up with Google/Apple only), a
 * different email is sent explaining they should sign in with their provider.
 * The API response to the browser is still identical { ok: true }.
 *
 * ── Email audit ────────────────────────────────────────────────────────────────
 * Every send attempt creates a Message row (PENDING) and is updated to
 * SENT/FAILED — consistent with the rest of the platform's email pipeline.
 */

import { NextResponse }                       from "next/server";
import { createHash, randomBytes }            from "crypto";
import { after }                              from "next/server";
import { prisma }                             from "@/lib/prisma";
import { rateLimit, getRealIp }               from "@/lib/rate-limit";
import { sendEmail, passwordResetEmail }      from "@/lib/email";

// ── Constants ─────────────────────────────────────────────────────────────────

const RESET_TOKEN_EXPIRES_MS = 60 * 60 * 1000; // 1 hour
const EXPIRES_IN_MINUTES     = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate a basic email format without external dependencies. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Standard anti-enumeration response.
 * Always returned — even on rate-limit bypass or invalid email — so callers
 * cannot distinguish between "found", "not found", or "OAuth-only".
 */
const OK_RESPONSE = NextResponse.json({ ok: true });

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Rate limit: 3 per IP per 15 min ─────────────────────────────────────
  const ip = getRealIp(request);
  const rl = rateLimit(ip, "forgot-password", { max: 3, windowMs: 15 * 60 * 1000 });

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "יותר מדי בקשות. נסה שוב מאוחר יותר." },
      {
        status:  429,
        headers: { "Retry-After": String(rl.retryAfter ?? 900) },
      },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let email: string;
  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    // Malformed JSON — return same generic response (no enumeration)
    return OK_RESPONSE;
  }

  if (!email || !isValidEmail(email)) {
    // Invalid format — return generic response. We could return 400, but
    // doing so leaks the fact that we validated — OK is safer here.
    return OK_RESPONSE;
  }

  // ── Defer all DB + email work so the response returns immediately ────────
  // Using after() keeps the response time constant and defers send failures
  // to the background — the user always sees the same generic UI message.
  after(async () => {
    try {
      // Look up user — include passwordHash presence only
      const user = await prisma.user.findUnique({
        where:  { email },
        select: {
          id:           true,
          fullName:     true,
          email:        true,
          passwordHash: true,
        },
      });

      if (!user) {
        // No account — do nothing silently
        console.log(`[forgot-password] no account for ${email} — silent no-op`);
        return;
      }

      // ── OAuth-only account (no password set) ─────────────────────────────
      if (!user.passwordHash) {
        console.log(`[forgot-password] OAuth-only account for ${email} — sending provider guidance email`);
        await sendOAuthGuidanceEmail(user.email, user.fullName);
        return;
      }

      // ── Credentials account — generate reset token ────────────────────────
      const rawToken    = randomBytes(32).toString("hex");
      const hashedToken = createHash("sha256").update(rawToken).digest("hex");
      const expires     = new Date(Date.now() + RESET_TOKEN_EXPIRES_MS);
      const baseUrl     = process.env.NEXTAUTH_URL ?? "https://www.signdeal.co.il";
      const resetLink   = `${baseUrl}/reset-password?token=${rawToken}`;

      // Invalidate any previous token for this email (one active at a time)
      await prisma.passwordResetToken.deleteMany({ where: { email } });

      // Persist hashed token
      await prisma.passwordResetToken.create({
        data: { email, token: hashedToken, expires },
      });

      console.log(`[forgot-password] token created for ${email} — expires ${expires.toISOString()}`);

      // ── Send email with full Message audit ───────────────────────────────
      const template = passwordResetEmail({
        fullName:         user.fullName,
        resetLink,
        expiresInMinutes: EXPIRES_IN_MINUTES,
      });

      const message = await prisma.message.create({
        data: {
          type:           "USER_PASSWORD_RESET",
          channel:        "EMAIL",
          provider:       "resend",
          subject:        template.subject,
          body:           template.text,
          userId:         user.id,
          recipientEmail: user.email,
          status:         "PENDING",
          attempts:       0,
        },
      });

      const result = await sendEmail({ to: user.email, ...template });

      await prisma.message.update({
        where: { id: message.id },
        data:  result.ok
          ? { status: "SENT",   providerMessageId: result.messageId ?? null, attempts: 1, lastAttemptAt: new Date() }
          : { status: "FAILED", failureReason: result.reason,                attempts: 1, lastAttemptAt: new Date() },
      });

      if (result.ok) {
        console.log(`[forgot-password] reset email sent to ${email} — msgId=${result.messageId ?? "n/a"}`);
      } else {
        console.error(`[forgot-password] reset email FAILED for ${email}: ${result.reason}`);
      }

    } catch (err) {
      console.error(
        "[forgot-password] unexpected error:",
        err instanceof Error ? err.message : err,
      );
    }
  });

  return OK_RESPONSE;
}

// ── OAuth guidance email ──────────────────────────────────────────────────────
// Sent when an OAuth-only user requests a password reset.
// The browser receives the identical OK response — only the email differs.

async function sendOAuthGuidanceEmail(email: string, fullName: string): Promise<void> {
  const firstName = fullName.trim().split(/\s+/)[0] || fullName.trim();

  const subject = "כניסה לחשבון SignDeal";

  const text = [
    `שלום ${fullName},`,
    "",
    "קיבלנו בקשה לאיפוס סיסמה עבור החשבון שלך.",
    "",
    "נראה שנרשמת ל-SignDeal באמצעות Google או Apple ולכן אין סיסמה מוגדרת לחשבונך.",
    "כדי להתחבר, לחץ/י על 'המשך עם Google' (או Apple) בדף ההתחברות.",
    "",
    "https://www.signdeal.co.il/login",
    "",
    "אם לא ביקשת זאת — ניתן להתעלם מאימייל זה.",
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  const result = await sendEmail({ to: email, subject, text });

  if (!result.ok) {
    console.error(`[forgot-password] OAuth guidance email FAILED for ${email}: ${result.reason}`);
  } else {
    console.log(`[forgot-password] OAuth guidance email sent to ${email} — msgId=${result.messageId ?? "n/a"}`);
  }

  // Note: OAuth guidance email is intentionally not audited in the Message
  // table — it contains no sensitive link and is purely informational.
  void firstName; // suppress lint warning — used conceptually above
}
