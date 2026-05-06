import { NextResponse } from "next/server";

/**
 * POST /api/test-sms
 *
 * Developer-only route — verifies real Infobip SMS delivery with the
 * approved "SignDeal" sender name.
 *
 * Body:  { "to": "+972XXXXXXXXX" }
 *
 * Returns:
 *   { success: true,  messageId: "...", providerResponse: { ... } }
 *   { success: false, error: "...",     providerResponse: { ... } | null }
 *
 * This route intentionally calls Infobip directly (not via sendSms()) so
 * the full raw provider response is always available in the JSON output
 * for debugging without extra parsing layers.
 *
 * ⚠ No auth guard — remove or restrict before any public deployment.
 */
export async function POST(request: Request) {
  const baseUrl = process.env.INFOBIP_BASE_URL?.trim();
  const apiKey  = process.env.INFOBIP_API_KEY?.trim();
  const sender  = (process.env.INFOBIP_SMS_SENDER?.trim() || "SignDeal");

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { success: false, error: "INFOBIP_BASE_URL or INFOBIP_API_KEY not configured in .env" },
      { status: 500 },
    );
  }

  let to: string;
  try {
    const body = await request.json();
    to = (body.to ?? "").trim();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body. Expected: { "to": "+972XXXXXXXXX" }' },
      { status: 400 },
    );
  }

  if (!to) {
    return NextResponse.json(
      { success: false, error: 'Missing required field "to"' },
      { status: 400 },
    );
  }

  const messageBody = "בדיקת SMS מ-SignDeal. אם קיבלת את ההודעה, השליחה עובדת.";

  const payload = {
    messages: [
      {
        from:         sender,
        destinations: [{ to }],
        text:         messageBody,
      },
    ],
  };

  console.log(`[POST /api/test-sms] sender="${sender}" to="${to}"`);

  let providerResponse: unknown = null;
  let httpStatus: number;

  try {
    const res = await fetch(`${baseUrl}/sms/2/text/advanced`, {
      method:  "POST",
      headers: {
        "Authorization": `App ${apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(payload),
    });

    httpStatus       = res.status;
    providerResponse = await res.json().catch(() => null);

    if (!res.ok) {
      // Infobip error shape: { requestError: { serviceException: { text, messageId } } }
      const detail =
        (providerResponse as { requestError?: { serviceException?: { text?: string } } })
          ?.requestError?.serviceException?.text ??
        `HTTP ${httpStatus}`;

      console.error(`[POST /api/test-sms] Infobip rejected: ${detail}`, providerResponse);

      return NextResponse.json(
        {
          success:          false,
          error:            `Infobip rejected the request: ${detail}`,
          providerResponse,
        },
        { status: 200 }, // 200 so the caller gets the full JSON regardless
      );
    }

    // Success: { messages: [{ messageId: string, status: { ... } }] }
    const messageId =
      (providerResponse as { messages?: { messageId?: string }[] })
        ?.messages?.[0]?.messageId;

    if (!messageId) {
      return NextResponse.json(
        {
          success:          false,
          error:            "Infobip returned 2xx but no messageId in response",
          providerResponse,
        },
        { status: 200 },
      );
    }

    console.log(`[POST /api/test-sms] Sent OK — messageId=${messageId}`);

    return NextResponse.json({
      success:          true,
      messageId,
      sender,
      to,
      providerResponse,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/test-sms] Network error:", message);
    return NextResponse.json(
      { success: false, error: `Network error: ${message}`, providerResponse },
      { status: 500 },
    );
  }
}
