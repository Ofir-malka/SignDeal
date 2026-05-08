/**
 * GET /api/test-sms/status?messageId={messageId}
 *
 * Developer-only route — fetches the Infobip delivery report for a messageId
 * and returns a sanitised summary (not the raw provider response).
 *
 * Access:
 *   - Production (NODE_ENV=production) with ENABLE_TEST_SMS_ROUTES≠"true" → 404
 *   - Unauthenticated session → 401
 *   - Email not in INTERNAL_ADMIN_EMAILS → 403
 */

import { NextResponse }             from "next/server";
import { requireTestRouteAccess }   from "@/lib/require-test-route";

// Delivery status fields we surface — no internal Infobip structure exposed.
type DeliveryReport = {
  messageId:   string;
  status:      string;       // e.g. "DELIVERED_TO_HANDSET"
  description: string;       // human-readable status description
  sentAt:      string | null;
  doneAt:      string | null;
  errorCode:   string | null;
};

export async function GET(request: Request) {
  const gate = await requireTestRouteAccess();
  if (!gate.ok) return gate.response;

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
    // Never reveal which specific env var is missing.
    return NextResponse.json(
      { success: false, error: "SMS provider not configured" },
      { status: 503 },
    );
  }

  console.log(
    `[GET /api/test-sms/status] fetching report — messageId=${messageId} by=${gate.email}`,
  );

  try {
    const res = await fetch(
      `${baseUrl}/sms/1/reports?messageId=${encodeURIComponent(messageId)}`,
      {
        method:  "GET",
        headers: {
          "Authorization": `App ${apiKey}`,
          "Accept":        "application/json",
        },
      },
    );

    // Parse response regardless of HTTP status — Infobip returns error detail in JSON
    const json = await res.json().catch(() => null) as Record<string, unknown> | null;

    if (!res.ok || !json) {
      // Extract error text from Infobip shape without returning the full object.
      const detail =
        (json as { requestError?: { serviceException?: { text?: string } } } | null)
          ?.requestError?.serviceException?.text ??
        `HTTP ${res.status}`;
      console.error(`[GET /api/test-sms/status] provider error: ${detail}`);
      return NextResponse.json(
        { success: false, error: `Provider error: ${detail}` },
        { status: 502 },
      );
    }

    // Infobip delivery report shape:
    //   { results: [{ messageId, sentAt, doneAt, smsCount,
    //                 status: { name, description, groupName },
    //                 error:  { name, description } }] }
    type InfobipReport = {
      messageId:  string;
      sentAt?:    string;
      doneAt?:    string;
      status?:    { name?: string; description?: string };
      error?:     { name?: string };
    };

    const results = (json["results"] as InfobipReport[] | undefined) ?? [];
    const report  = results[0];

    if (!report) {
      return NextResponse.json(
        { success: false, error: "No delivery report found for this messageId yet" },
        { status: 404 },
      );
    }

    const summary: DeliveryReport = {
      messageId:   report.messageId,
      status:      report.status?.name        ?? "UNKNOWN",
      description: report.status?.description ?? "",
      sentAt:      report.sentAt              ?? null,
      doneAt:      report.doneAt              ?? null,
      errorCode:   report.error?.name         ?? null,
    };

    console.log(`[GET /api/test-sms/status] report: status=${summary.status}`);
    return NextResponse.json({ success: true, report: summary });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/test-sms/status] network error:", message);
    return NextResponse.json(
      { success: false, error: "Network error reaching SMS provider" },
      { status: 500 },
    );
  }
}
