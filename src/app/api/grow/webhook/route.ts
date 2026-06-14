/**
 * POST /api/grow/webhook  —  P3a CAPTURE-ONLY.
 *
 * Receives the Grow CreatePaymentLink server-to-server callback (sent to the
 * notifyUrl we put in the CreatePaymentLink request) and stores a SANITIZED
 * snapshot so we can learn the exact payload shape.
 *
 * Capture-only — this route intentionally does NOT:
 *   • mark Payment PAID  • update Contract  • call ApproveTransaction
 *   • send email         • do idempotent paid-transition logic
 * That is P3b. Always returns 200. Flat URL, NO token path.
 *
 * Where to view captures:
 *   SELECT "eventId","eventType","payload","processedAt"
 *   FROM "WebhookEvent" WHERE provider = 'grow_payment'
 *   ORDER BY "processedAt" DESC;
 * The payload column holds { contentType, kind, fieldNames, data } — SANITIZED
 * (token/apiKey/secret values + PAN-like digits redacted; field names preserved).
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import {
  parseCallbackBody,
  sanitizeForCapture,
  redactRawPreview,
} from "@/lib/payments/providers/grow/webhook-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

function ok(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const rawText = await req.text();
    const contentType = req.headers.get("content-type");
    const { kind, data } = parseCallbackBody(rawText, contentType);

    const safeData = data ? sanitizeForCapture(data) : { rawPreview: redactRawPreview(rawText) };
    const fieldNames = data ? Object.keys(data) : [];

    // Reuse WebhookEvent (no migration). eventId = hash(body) so identical Grow
    // retries dedupe via @@unique([provider, eventId]); provider isolates captures.
    const eventId = createHash("sha256").update(rawText).digest("hex");
    const payload = JSON.parse(
      JSON.stringify({ contentType, kind, fieldNames, data: safeData }),
    );

    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "grow_payment",
          eventId,
          eventType: "createpaymentlink_callback_capture",
          payload,
          status: "RECEIVED",
        },
      });
    } catch (err) {
      // Duplicate body (a Grow retry) → already captured; otherwise log (no secrets).
      const dup = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!dup) {
        console.error(
          "[grow/webhook capture] WebhookEvent.create failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Non-secret summary to logs — field NAMES only, never values.
    console.log(
      `[grow/webhook capture] ip=${clientIp(req) ?? "n/a"} ct=${contentType ?? "none"} ` +
        `kind=${kind} fields=[${fieldNames.join(",")}]`,
    );

    return ok();
  } catch (err) {
    // Capture-only must never fail loudly; still return 200 (no retry storm).
    console.error(
      "[grow/webhook capture] unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return ok();
  }
}
