import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface ContractSigningEmailData {
  clientName:      string;
  brokerName:      string;
  propertyAddress: string;
  signingLink:     string;
  /** Optional expiry date shown to the client. */
  expiresAt?:      string; // e.g. "24 במאי 2026"
}

export function contractSigningEmail(data: ContractSigningEmailData): EmailTemplate {
  const { clientName, brokerName, propertyAddress, signingLink, expiresAt } = data;

  const subject = `חוזה ממתין לחתימתך — ${propertyAddress}`;

  const text = [
    `שלום ${clientName},`,
    "",
    `${brokerName} שלח לך חוזה תיווך לחתימה דיגיטלית עבור הנכס:`,
    `${propertyAddress}`,
    "",
    "לחץ על הקישור הבא לצפייה וחתימה על החוזה:",
    signingLink,
    ...(expiresAt ? ["", `הקישור תקף עד: ${expiresAt}`] : []),
    "",
    "אם אינך מצפה לחוזה זה, ניתן להתעלם מהודעה זו.",
    "",
    "בברכה,",
    brokerName,
    "באמצעות SignDeal",
  ].join("\n");

  const expiryLine = expiresAt
    ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">⏰ הקישור תקף עד: ${escHtml(expiresAt)}</p>`
    : "";

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      חוזה ממתין לחתימתך ✍️
    </h2>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(clientName)},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      <strong>${escHtml(brokerName)}</strong> שלח לך חוזה תיווך לחתימה דיגיטלית:
    </p>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:#374151;">
        📍 <strong>נכס:</strong> ${escHtml(propertyAddress)}
      </p>
    </div>
    ${ctaButton(signingLink, "לחתימה על החוזה")}
    ${expiryLine}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
      אם אינך מצפה לחוזה זה, ניתן להתעלם מהודעה זו בבטחה.
    </p>
  `);

  return { subject, text, html };
}
