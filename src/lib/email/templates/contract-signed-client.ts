/**
 * email/templates/contract-signed-client.ts
 *
 * Sent to the CLIENT immediately after they sign a contract.
 * Contains:
 *   • A confirmation that their signature was received.
 *   • Property and broker details for reference.
 *   • A note that the signed PDF is attached (when the caller supplies one).
 *   • A plain-text fallback for email clients that cannot render HTML or
 *     open attachments.
 *
 * The email is intentionally simple and reassuring — the client just signed
 * a legal document and needs to trust that it was received correctly.
 * No CTA buttons; this is a receipt, not a conversion email.
 */

import { baseHtml, escHtml } from "./base";
import type { EmailTemplate } from "../provider";

export interface ContractSignedClientEmailData {
  /** Client's full name — used in the greeting. */
  clientName:      string;
  /** Broker's full name — shown so the client knows who they signed with. */
  brokerName:      string;
  /** Human-readable property address (already decoded — no "street||floor" pipe encoding). */
  propertyAddress: string;
  /** Contract ID — short reference for the client's records. */
  contractId:      string;
  /** Formatted signing date/time, e.g. "21 במאי 2026, 14:32". */
  signedAt?:       string;
  /**
   * Whether a PDF attachment is included in the email.
   * When true, the template adds a note directing the client to the attachment.
   * When false/absent, the note is omitted and the client is told to contact
   * the broker if they need a copy.
   */
  hasPdfAttachment?: boolean;
}

export function contractSignedClientEmail(
  data: ContractSignedClientEmailData,
): EmailTemplate {
  const {
    clientName,
    brokerName,
    propertyAddress,
    contractId,
    signedAt,
    hasPdfAttachment = false,
  } = data;

  const subject = `✅ החוזה נחתם — ${propertyAddress}`;

  // ── Plain-text version ────────────────────────────────────────────────────
  const text = [
    `שלום ${clientName},`,
    "",
    "תודה! החתימה שלך על חוזה התיווך התקבלה בהצלחה.",
    "",
    `נכס:   ${propertyAddress}`,
    `מתווך: ${brokerName}`,
    ...(signedAt ? [`תאריך: ${signedAt}`] : []),
    `מספר חוזה: ${contractId}`,
    "",
    hasPdfAttachment
      ? "עותק חתום של החוזה מצורף לאימייל זה לשמירה."
      : "לקבלת עותק חתום של החוזה, פנה/י ישירות למתווך.",
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  // ── HTML version ──────────────────────────────────────────────────────────
  const signedAtLine = signedAt
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;">📅 <strong>תאריך חתימה:</strong> ${escHtml(signedAt)}</p>`
    : "";

  const attachmentNote = hasPdfAttachment
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-top:20px;">
        <p style="margin:0;font-size:14px;color:#1e40af;">
          📎 <strong>עותק החוזה החתום מצורף לאימייל זה.</strong><br />
          <span style="color:#374151;">שמור/י את הקובץ המצורף לצרכי עיון עתידי.</span>
        </p>
      </div>`
    : `<p style="margin-top:20px;font-size:14px;color:#6b7280;">
        לקבלת עותק חתום של החוזה, פנה/י ישירות למתווך ${escHtml(brokerName)}.
      </p>`;

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      החתימה התקבלה! ✅
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(clientName)}, תודה על חתימתך על חוזה התיווך.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:4px;">
      <p style="margin:0 0 6px;font-size:15px;color:#166534;font-weight:600;">
        פרטי החוזה
      </p>
      <p style="margin:4px 0;font-size:14px;color:#374151;">📍 <strong>נכס:</strong> ${escHtml(propertyAddress)}</p>
      <p style="margin:4px 0;font-size:14px;color:#374151;">👤 <strong>מתווך:</strong> ${escHtml(brokerName)}</p>
      ${signedAtLine}
      <p style="margin:4px 0;font-size:13px;color:#6b7280;">מספר חוזה: ${escHtml(contractId)}</p>
    </div>
    ${attachmentNote}
  `);

  return { subject, text, html };
}
