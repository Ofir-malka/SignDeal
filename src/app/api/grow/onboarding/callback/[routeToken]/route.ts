/**
 * POST /api/grow/onboarding/callback/[routeToken]
 *
 * Inbound Grow onboarding server-update ("callback"). PUBLIC endpoint (Grow has
 * no SignDeal session); protected by the env-level route token + payload
 * correlation. This route is OUTSIDE the proxy/middleware matcher (all /api/* is
 * excluded), so it needs no middleware change.
 *
 * Contract: application/json only. A SUCCESS callback whose processing fails
 * returns 5xx (NOT 200) so Grow retries (rule 8). The dedup marker is only set
 * to "applied" after full success.
 *
 * The route is a thin shell; all logic + idempotency lives in the adapter.
 */

import { ingestCallback } from "@/lib/grow/onboarding/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request, { params }: { params: Promise<{ routeToken: string }> }) {
  try {
    const { routeToken } = await params;
    const rawText = await req.text();

    const result = await ingestCallback({
      rawText,
      contentType: req.headers.get("content-type"),
      sourceIp: clientIp(req),
      httpMethod: req.method,
      routeToken,
    });

    return new Response(JSON.stringify({ received: result.applied }), {
      status: result.httpStatus,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Unexpected (e.g. DB unavailable). 5xx so Grow retries — reprocessing is
    // idempotent. No payload/secret is logged here.
    console.error("[POST /api/grow/onboarding/callback] unexpected error:", err);
    return new Response(JSON.stringify({ received: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
