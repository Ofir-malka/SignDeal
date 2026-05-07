import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/require-user";

/**
 * GET /api/test-sms/status?messageId={messageId}
 *
 * Developer-only route — fetches the Infobip delivery report for a given
 * messageId and returns the raw provider response for debugging.
 *
 * Calls: GET /sms/1/reports?messageId={messageId}
 *
 * Returns:
 *   { success: true,  messageId, providerResponse }
 *   { success: false, error,     providerResponse | null }
 *
 * Auth required. Disabled entirely in production (returns 404).
 */
export async function GET(request: Request) {
  // ── Disabled in production — return 404 so the route is invisible to attackers
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Auth guard — must be a signed-in broker even in dev/staging
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get("messageId")?.trim();

  if (!messageId) {
    return NextResponse.json(
      { success: false, error: 'Missing required query param "messageId"' },
      { status: 400 },
    );
  }

  const baseUrl = process.env.INFOBIP_BASE_URL?.trim();
  const apiKey  = process.env.INFOBIP_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { success: false, error: "INFOBIP_BASE_URL or INFOBIP_API_KEY not configured in .env" },
      { status: 500 },
    );
  }

  const url = `${baseUrl}/sms/1/reports?messageId=${encodeURIComponent(messageId)}`;
  console.log(`[GET /api/test-sms/status] Fetching delivery report — messageId=${messageId}`);

  let providerResponse: unknown = null;

  try {
    const res = await fetch(url, {
      method:  "GET",
      headers: {
        "Authorization": `App ${apiKey}`,
        "Accept":        "application/json",
      },
    });

    providerResponse = await res.json().catch(() => null);

    if (!res.ok) {
      const detail =
        (providerResponse as { requestError?: { serviceException?: { text?: string } } })
          ?.requestError?.serviceException?.text ??
        `HTTP ${res.status}`;

      console.error(`[GET /api/test-sms/status] Infobip error: ${detail}`, providerResponse);

      return NextResponse.json(
        { success: false, error: `Infobip error: ${detail}`, providerResponse },
        { status: 200 },
      );
    }

    console.log(`[GET /api/test-sms/status] Report received for messageId=${messageId}`);

    return NextResponse.json({ success: true, messageId, providerResponse });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/test-sms/status] Network error:", message);
    return NextResponse.json(
      { success: false, error: `Network error: ${message}`, providerResponse },
      { status: 500 },
    );
  }
}
