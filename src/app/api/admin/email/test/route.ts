/**
 * POST /api/admin/email/test
 *
 * Sends a test email to the logged-in admin (or a specified recipient).
 * Admin role is re-checked against the DB on every call (requireAdmin).
 *
 * Query params:
 *   ?template=<name>   selects which template to send (default: "welcome")
 *   ?to=<email>        override recipient (default: admin's own email)
 *   ?subject=<text>    override template subject
 *
 * Supported template names:
 *   welcome | contract-signing | contract-signed |
 *   payment-request | payment-received | trial-ending
 *
 * Response JSON:
 *   { ok, template, to, subject, from, replyTo, live, messageId?,
 *     reason?, stubNote?, durationMs, timestamp }
 *
 * This endpoint exists purely for development/staging QA.
 * It never touches production data.
 */
import { NextResponse }     from "next/server";
import { prisma }           from "@/lib/prisma";
import { requireAdmin }     from "@/lib/require-admin";
import {
  sendEmail,
  getEmailConfig,
  welcomeEmail,
  contractSigningEmail,
  contractSignedEmail,
  paymentRequestEmail,
  paymentReceivedEmail,
  trialEndingEmail,
  passwordResetEmail,
} from "@/lib/email";

const TEMPLATES = [
  "welcome",
  "contract-signing",
  "contract-signed",
  "payment-request",
  "payment-received",
  "trial-ending",
  "password-reset",
] as const;
type TemplateName = (typeof TEMPLATES)[number];

function buildTemplate(name: TemplateName, adminName: string, recipientEmail: string) {
  const today = new Date().toLocaleDateString("he-IL", {
    day: "numeric", month: "long", year: "numeric",
  });

  switch (name) {
    case "welcome":
      return welcomeEmail({ fullName: adminName });

    case "contract-signing":
      return contractSigningEmail({
        clientName:      "ישראל ישראלי (Test)",
        brokerName:      adminName,
        propertyAddress: "רוטשילד 1, תל אביב",
        signingLink:     "https://www.signdeal.co.il/contracts/sign/test-token",
        expiresAt:       today,
      });

    case "contract-signed":
      return contractSignedEmail({
        brokerName:      adminName,
        clientName:      "ישראל ישראלי (Test)",
        propertyAddress: "רוטשילד 1, תל אביב",
        contractId:      "test-contract-id",
        signedAt:        today,
      });

    case "payment-request":
      return paymentRequestEmail({
        clientName:      "ישראל ישראלי (Test)",
        brokerName:      adminName,
        propertyAddress: "רוטשילד 1, תל אביב",
        amountNis:       15000,
        paymentLink:     "https://www.signdeal.co.il/pay/test",
        dueDate:         today,
      });

    case "payment-received":
      return paymentReceivedEmail({
        brokerName:      adminName,
        clientName:      "ישראל ישראלי (Test)",
        propertyAddress: "רוטשילד 1, תל אביב",
        amountNis:       15000,
        contractId:      "test-contract-id",
        receivedAt:      today,
      });

    case "trial-ending":
      return trialEndingEmail({
        fullName:    adminName,
        trialEndsAt: today,
        daysLeft:    2,
      });

    case "password-reset":
      return passwordResetEmail({
        fullName:         adminName,
        resetLink:        `https://www.signdeal.co.il/reset-password?token=test-token-preview-only`,
        expiresInMinutes: 60,
      });
  }
}

export async function POST(request: Request) {
  // ── Admin gate ───────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;
  const { adminId } = adminResult;

  // ── Read query params ────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const rawTemplate = (searchParams.get("template") ?? "welcome").toLowerCase();
  const templateName: TemplateName = TEMPLATES.includes(rawTemplate as TemplateName)
    ? (rawTemplate as TemplateName)
    : "welcome";
  const toOverride      = searchParams.get("to")?.trim()      || null;
  const subjectOverride = searchParams.get("subject")?.trim() || null;

  // ── Fetch admin from DB (email not in JWT) ────────────────────────────────
  const admin = await prisma.user.findUnique({
    where:  { id: adminId },
    select: { email: true, fullName: true },
  });

  if (!admin?.email) {
    return NextResponse.json({ error: "Admin email not found" }, { status: 404 });
  }

  // ── Validate ?to override ────────────────────────────────────────────────
  const recipient = toOverride ?? admin.email;
  const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(recipient)) {
    return NextResponse.json(
      { error: `Invalid recipient email: "${recipient}"` },
      { status: 400 },
    );
  }

  // ── Build template + apply overrides ─────────────────────────────────────
  const config   = getEmailConfig();
  const template = buildTemplate(templateName, admin.fullName, recipient);
  const subject  = subjectOverride ?? template.subject;

  console.log(
    `[admin/email/test] template="${templateName}" to="${recipient}"` +
    (toOverride      ? ` (override)` : "") +
    (subjectOverride ? ` subject-override="${subject}"` : "") +
    ` live=${config.isLive}`,
  );

  // ── Send + time ───────────────────────────────────────────────────────────
  const startedAt = Date.now();
  const result    = await sendEmail({ to: recipient, ...template, subject });
  const durationMs = Date.now() - startedAt;

  return NextResponse.json({
    ok:          result.ok,
    template:    templateName,
    to:          recipient,
    toOverride:  toOverride ?? undefined,
    subject,
    subjectOverride: subjectOverride ?? undefined,
    from:        config.from,
    replyTo:     config.replyTo,
    live:        config.isLive,
    messageId:   result.ok ? (result.messageId ?? null) : undefined,
    reason:      result.ok ? undefined : result.reason,
    stubNote:    !config.isLive
      ? "RESEND_API_KEY is not set — email was logged only (stub mode)."
      : undefined,
    durationMs,
    timestamp:   new Date().toISOString(),
  });
}
