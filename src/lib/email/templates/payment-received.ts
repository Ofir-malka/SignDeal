import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface PaymentReceivedEmailData {
  /** Broker receiving the confirmation. */
  brokerName:      string;
  clientName:      string;
  propertyAddress: string;
  /** Amount in NIS (full currency units). */
  amountNis:       number;
  contractId:      string;
  receivedAt?:     string; // e.g. "21 במאי 2026"
  dashboardUrl?:   string;
}

function formatNis(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style:    "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function paymentReceivedEmail(data: PaymentReceivedEmailData): EmailTemplate {
  const {
    brokerName, clientName, propertyAddress, amountNis, contractId,
    receivedAt, dashboardUrl = "https://www.signdeal.co.il/payments",
  } = data;
  const amountFormatted = formatNis(amountNis);

  const subject = `✅ תשלום התקבל — ${amountFormatted} מ-${clientName}`;

  const text = [
    `שלום ${brokerName},`,
    "",
    `תשלום עמלת תיווך התקבל בהצלחה!`,
    "",
    `לקוח: ${clientName}`,
    `נכס: ${propertyAddress}`,
    `סכום: ${amountFormatted}`,
    ...(receivedAt ? [`תאריך: ${receivedAt}`] : []),
    `מספר חוזה: ${contractId}`,
    "",
    "כנס ללוח הבקרה לצפייה בפרטי התשלום:",
    dashboardUrl,
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  const receivedAtLine = receivedAt
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;">📅 <strong>תאריך:</strong> ${escHtml(receivedAt)}</p>`
    : "";

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      תשלום התקבל! 🎉
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(brokerName)}, עמלת התיווך שלך שולמה בהצלחה.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#166534;">
        💰 ${escHtml(amountFormatted)}
      </p>
      <p style="margin:4px 0;font-size:14px;color:#374151;">👤 <strong>לקוח:</strong> ${escHtml(clientName)}</p>
      <p style="margin:4px 0;font-size:14px;color:#374151;">📍 <strong>נכס:</strong> ${escHtml(propertyAddress)}</p>
      ${receivedAtLine}
      <p style="margin:4px 0;font-size:13px;color:#6b7280;">מספר חוזה: ${escHtml(contractId)}</p>
    </div>
    ${ctaButton(dashboardUrl, "צפייה בפרטי התשלום")}
  `);

  return { subject, text, html };
}
