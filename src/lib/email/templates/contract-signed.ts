import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface ContractSignedEmailData {
  /** Broker receiving the confirmation. */
  brokerName:      string;
  clientName:      string;
  propertyAddress: string;
  contractId:      string;
  signedAt?:       string; // e.g. "21 במאי 2026, 14:32"
  dashboardUrl?:   string;
}

export function contractSignedEmail(data: ContractSignedEmailData): EmailTemplate {
  const {
    brokerName, clientName, propertyAddress, contractId,
    signedAt, dashboardUrl = "https://www.signdeal.co.il/contracts",
  } = data;

  const subject = `✅ ${clientName} חתם על החוזה — ${propertyAddress}`;

  const text = [
    `שלום ${brokerName},`,
    "",
    `בשורות טובות! ${clientName} חתם על חוזה התיווך עבור:`,
    `${propertyAddress}`,
    ...(signedAt ? ["", `תאריך חתימה: ${signedAt}`] : []),
    "",
    `מספר חוזה: ${contractId}`,
    "",
    "כנס ללוח הבקרה לצפייה בחוזה החתום:",
    dashboardUrl,
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  const signedAtLine = signedAt
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;">📅 <strong>תאריך חתימה:</strong> ${escHtml(signedAt)}</p>`
    : "";

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      החוזה נחתם! ✅
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(brokerName)}, יש לך חדשות טובות!
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:15px;color:#166534;font-weight:600;">
        ${escHtml(clientName)} חתם על החוזה
      </p>
      <p style="margin:4px 0;font-size:14px;color:#374151;">📍 <strong>נכס:</strong> ${escHtml(propertyAddress)}</p>
      ${signedAtLine}
      <p style="margin:4px 0;font-size:13px;color:#6b7280;">מספר חוזה: ${escHtml(contractId)}</p>
    </div>
    ${ctaButton(dashboardUrl, "צפייה בחוזה החתום")}
  `);

  return { subject, text, html };
}
