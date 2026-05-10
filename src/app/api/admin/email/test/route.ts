/**
 * POST /api/admin/email/test
 *
 * Sends a test email to the logged-in admin's email address.
 * Admin role is re-checked against the DB on every call (requireAdmin).
 *
 * Query param  ?template=<name>  selects which template to send.
 * Defaults to "welcome" when omitted.
 *
 * Supported template names:
 *   welcome | contract-signing | contract-signed |
 *   payment-request | payment-received | trial-ending
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
} from "@/lib/email";

const TEMPLATES = [
  "welcome",
  "contract-signing",
  "contract-signed",
  "payment-request",
  "payment-received",
  "trial-ending",
] as const;
type TemplateName = (typeof TEMPLATES)[number];

function buildTemplate(name: TemplateName, adminName: string) {
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
  }
}

export async function POST(request: Request) {
  // ── Admin gate ───────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;
  const { adminId } = adminResult;

  // ── Read template param ──────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const rawTemplate = (searchParams.get("template") ?? "welcome").toLowerCase();
  const templateName: TemplateName = TEMPLATES.includes(rawTemplate as TemplateName)
    ? (rawTemplate as TemplateName)
    : "welcome";

  // ── Fetch admin email from DB (not in JWT) ────────────────────────────────
  const admin = await prisma.user.findUnique({
    where:  { id: adminId },
    select: { email: true, fullName: true },
  });

  if (!admin?.email) {
    return NextResponse.json({ error: "Admin email not found" }, { status: 404 });
  }

  // ── Build + send ──────────────────────────────────────────────────────────
  const config   = getEmailConfig();
  const template = buildTemplate(templateName, admin.fullName);

  console.log(
    `[admin/email/test] sending template="${templateName}" to="${admin.email}" live=${config.isLive}`,
  );

  const result = await sendEmail({ to: admin.email, ...template });

  return NextResponse.json({
    ok:         result.ok,
    template:   templateName,
    to:         admin.email,
    subject:    template.subject,
    live:       config.isLive,
    messageId:  result.ok ? result.messageId : undefined,
    reason:     result.ok ? undefined : result.reason,
    stubNote:   !config.isLive
      ? "RESEND_API_KEY is not set — email was logged only (stub mode)."
      : undefined,
  });
}
