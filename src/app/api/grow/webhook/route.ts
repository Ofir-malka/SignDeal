/**
 * POST /api/grow/webhook — Grow webhook DISPATCHER (flat URL, both rails).
 *
 * Grow sends every server-to-server callback to this ONE fixed URL (no path token —
 * already configured in the Grow dashboard). Two unrelated flows land here, and they
 * must never mix:
 *
 *   "payment" → RAIL B client→broker brokerage (CreatePaymentLink callbacks).
 *               Handler: @/lib/payments/providers/grow/webhook-handler
 *               Capture: WebhookEvent provider 'grow_payment'
 *   "saas"    → RAIL A broker→SignDeal SaaS billing (cField1 "saas_*" namespaces /
 *               SaaS-merchant identity). Handler: @/lib/billing/providers/grow/webhook-handler
 *               Capture: WebhookEvent provider 'grow_saas'
 *               SHADOW MODE by default (GROW_SAAS_WEBHOOK_ENABLED=false → capture only).
 *
 * This route is the ONLY file that touches both rails (app routes are outside the
 * ESLint rail walls); it stays a thin shell — read raw body, classify (pure), dispatch,
 * return. The callback is only a TRIGGER on both rails; the authoritative decision
 * comes from each handler's own verify-then-trust re-fetch. Rail B behavior and its
 * 200-terminal / 5xx-transient contract are unchanged.
 *
 * Audit:
 *   SELECT provider, "eventType", status, error, "processedAt"
 *   FROM "WebhookEvent" WHERE provider IN ('grow_payment','grow_saas')
 *   ORDER BY "processedAt" DESC;
 */

import { classifyGrowCallback } from "./classify";
import { processGrowPaymentCallback } from "@/lib/payments/providers/grow/webhook-handler";
import { processGrowSaasCallback } from "@/lib/billing/providers/grow/webhook-handler";

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
    const contentType = req.headers.get("content-type");
    const sourceIp = clientIp(req);

    // Pure classification — no payload/secret logged, telemetry only.
    const cls = classifyGrowCallback(rawText, contentType);
    console.log(`[grow/webhook] classified=${cls.rail} reason=${cls.reason}`);

    const result =
      cls.rail === "saas"
        ? await processGrowSaasCallback({ rawText, contentType, sourceIp })
        : await processGrowPaymentCallback({ rawText, contentType, sourceIp });

    return new Response(JSON.stringify({ received: result.outcome }), {
      status: result.httpStatus,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Unexpected (e.g. DB unavailable). 5xx so Grow retries — reprocessing is
    // idempotent on both rails (status guards + claim gates). No payload/secret logged.
    console.error("[grow/webhook] unexpected error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ received: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
