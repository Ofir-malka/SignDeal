/**
 * POST /api/grow/webhook  —  Grow CreatePaymentLink server-to-server callback (P3b).
 *
 * Flat URL (no token path) — Grow already has this exact URL configured. The
 * callback is only the TRIGGER; the authoritative PAID decision comes from a
 * getPaymentLinkInfo re-fetch inside the handler (verify-then-trust). All logic +
 * idempotency live in processGrowPaymentCallback; this route is a thin shell.
 *
 * Returns 200 for terminal outcomes; 5xx only on our transient errors so Grow
 * retries (reprocessing is idempotent via the Payment status guard). No secrets
 * are logged here.
 *
 * Captured/audited in WebhookEvent (provider 'grow_payment'):
 *   SELECT "eventId","eventType","payload","status","processedAt"
 *   FROM "WebhookEvent" WHERE provider = 'grow_payment' ORDER BY "processedAt" DESC;
 */

import { processGrowPaymentCallback } from "@/lib/payments/providers/grow/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request): Promise<Response> {
  try {
    const rawText = await req.text();
    const result = await processGrowPaymentCallback({
      rawText,
      contentType: req.headers.get("content-type"),
      sourceIp: clientIp(req),
    });
    return new Response(JSON.stringify({ received: result.outcome }), {
      status: result.httpStatus,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Unexpected (e.g. DB unavailable). 5xx so Grow retries — reprocessing is
    // idempotent (Payment status guard). No payload/secret is logged.
    console.error("[grow/webhook] unexpected error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ received: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
