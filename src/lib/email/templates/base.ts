/**
 * email/templates/base.ts
 *
 * Shared HTML shell used by all email templates.
 * Inline styles only — external CSS is stripped by most email clients.
 * RTL Hebrew layout.
 */

const BRAND_COLOR = "#4f46e5"; // indigo-600

export function baseHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:24px 32px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">SignDeal</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #e5e7eb;padding:20px 32px;background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
              © 2026 SignDeal — פלטפורמה לניהול חוזי תיווך<br />
              אם אינך מצפה לאימייל זה, ניתן להתעלם ממנו בבטחה.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Escape user-supplied strings before embedding in HTML. */
export function escHtml(str: string): string {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

/** Primary button component for email CTAs. */
export function ctaButton(href: string, label: string): string {
  return `<a href="${escHtml(href)}"
    style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;
           font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;
           text-decoration:none;margin:20px 0;"
  >${escHtml(label)}</a>`;
}
