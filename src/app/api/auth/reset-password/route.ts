/**
 * POST /api/auth/reset-password
 *
 * Validates a password-reset token and updates the user's password.
 *
 * ── Security guarantees ────────────────────────────────────────────────────────
 * • Token lookup: incoming rawToken is SHA-256 hashed before DB lookup.
 *   The plain token is never stored — only the hash lives in the database.
 * • Expiry: tokens older than 1 hour are rejected.
 * • Single use: the token row is deleted atomically with the password update
 *   inside a $transaction — no double-use is possible even under race conditions.
 * • Rate limit: 5 requests per IP per 10 minutes.
 * • Constant-time-ish path: we always hash the incoming token (regardless of
 *   length/format) before querying, so the branch taken on "not found" vs
 *   "expired" does not leak information through timing.
 *
 * ── Error responses ────────────────────────────────────────────────────────────
 * • 400 INVALID_OR_EXPIRED — token not found, already used, or expired.
 *   (Never distinguish between these — avoids leaking state.)
 * • 400 PASSWORD_TOO_SHORT — password < 8 characters.
 * • 400 MISSING_FIELDS     — token or password absent.
 * • 429                    — rate limited.
 * • 200 { ok: true }       — success.
 */

import { NextResponse }          from "next/server";
import { createHash }            from "crypto";
import bcrypt                    from "bcryptjs";
import { prisma }                from "@/lib/prisma";
import { rateLimit, getRealIp }  from "@/lib/rate-limit";

const BCRYPT_ROUNDS = 10;

export async function POST(request: Request) {
  // ── Rate limit: 5 per IP per 10 min ─────────────────────────────────────
  const ip = getRealIp(request);
  const rl = rateLimit(ip, "reset-password", { max: 5, windowMs: 10 * 60 * 1000 });

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "יותר מדי בקשות. נסה שוב מאוחר יותר." },
      {
        status:  429,
        headers: { "Retry-After": String(rl.retryAfter ?? 600) },
      },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let rawToken: string;
  let newPassword: string;
  try {
    const body = await request.json() as { token?: unknown; password?: unknown };
    rawToken    = typeof body.token    === "string" ? body.token.trim()    : "";
    newPassword = typeof body.password === "string" ? body.password        : "";
  } catch {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  if (!rawToken || !newPassword) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  // ── Hash the incoming token — never compare in plain text ────────────────
  const hashedToken = createHash("sha256").update(rawToken).digest("hex");

  // ── Look up token ─────────────────────────────────────────────────────────
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token: hashedToken },
  });

  // Not found or already deleted (used)
  if (!resetToken) {
    console.log(`[reset-password] token not found (hash=${hashedToken.slice(0, 12)}...)`);
    return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  // Expired
  if (resetToken.expires < new Date()) {
    console.log(`[reset-password] token expired for ${resetToken.email}`);
    // Clean up the stale row — fire-and-forget
    void prisma.passwordResetToken.delete({ where: { token: hashedToken } }).catch(() => null);
    return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  // ── Look up user by email (token is not a FK, so we look up separately) ──
  const user = await prisma.user.findUnique({
    where:  { email: resetToken.email },
    select: { id: true, email: true },
  });

  if (!user) {
    // Extremely rare edge case: account deleted after token was issued
    console.warn(`[reset-password] user not found for email=${resetToken.email} — cleaning token`);
    void prisma.passwordResetToken.delete({ where: { token: hashedToken } }).catch(() => null);
    return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  // ── Hash new password ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // ── Atomic update: set new password + delete token in one transaction ────
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data:  { passwordHash },
      }),
      prisma.passwordResetToken.delete({
        where: { token: hashedToken },
      }),
    ]);
  } catch (err) {
    console.error(
      `[reset-password] transaction failed for ${user.email}:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "RESET_FAILED" },
      { status: 500 },
    );
  }

  console.log(`[reset-password] password reset successful for ${user.email}`);
  return NextResponse.json({ ok: true });
}
