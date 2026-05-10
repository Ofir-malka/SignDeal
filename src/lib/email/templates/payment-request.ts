import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface PaymentRequestEmailData {
  clientName:      string;
  brokerName:      string;
  propertyAddress: string;
  /** Amount in NIS (full currency units, not agorot). */
  amountNis:       number;
  paymentLink:     string;
  dueDate?:        string; // e.g. "31 במאי 2026"
}

function formatNis(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style:    "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function paymentRequestEmail(data: PaymentRequestEmailData): EmailTemplate {
  const { clientName, brokerName, propertyAddress, amountNis, paymentLink, dueDate } = data;
  const amountFormatted = formatNis(amountNis);

  const subject = `בקשת תשלום עמלת תיווך — ${propertyAddress}`;

  const text = [
    `שלום ${clientName},`,
    "",
    `${brokerName} שלח לך בקשת תשלום עמלת תיווך עבור הנכס:`,
    `${propertyAddress}`,
    "",
    `סכום לתשלום: ${amountFormatted}`,
    ...(dueDate ? [`תאריך לתשלום: ${dueDate}`] : []),
    "",
    "לתשלום מאובטח לחץ כאן:",
    paymentLink,
    "",
    "בברכה,",
    brokerName,
    "באמצעות SignDeal",
  ].join("\n");

  const dueDateLine = dueDate
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;">📅 <strong>תאריך לתשלום:</strong> ${escHtml(dueDate)}</p>`
    : "";

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      בקשת תשלום עמלת תיווך 💳
    </h2>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(clientName)},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      <strong>${escHtml(brokerName)}</strong> שלח לך בקשת תשלום עמלת תיווך:
    </p>
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">📍 <strong>נכס:</strong> ${escHtml(propertyAddress)}</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#111827;">💰 ${escHtml(amountFormatted)}</p>
      ${dueDateLine}
    </div>
    ${ctaButton(paymentLink, "תשלום מאובטח עכשיו")}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">
      התשלום מאובטח ומוצפן. לאחר התשלום תקבל אישור במייל.
    </p>
  `);

  return { subject, text, html };
}
