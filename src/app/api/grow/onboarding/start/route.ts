/**
 * POST /api/grow/onboarding/start
 *
 * Authenticated broker launches a Grow onboarding lead (GetLink) and gets back a
 * session id + the hosted form URL.
 *
 * Safety:
 *  • GROW_ONBOARDING_ENABLED must be true — otherwise NO Grow call is made (503).
 *  • Rate-limited per broker.
 *  • Runs in the Node runtime (transitively touches server-only secret config).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/require-user";
import { rateLimit } from "@/lib/rate-limit";
import { isOnboardingEnabled } from "@/lib/grow/config";
import { startOnboarding } from "@/lib/grow/onboarding/adapter";
import {
  GrowApiError,
  GrowConfigError,
  GrowNetworkError,
  isBusinessExistsError,
} from "@/lib/grow/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    // Feature flag OFF → safe no-op, no Grow call.
    if (!isOnboardingEnabled()) {
      return NextResponse.json(
        { error: "Grow onboarding is not enabled" },
        { status: 503 },
      );
    }

    const rl = await rateLimit(userId, "grow-onboarding-start", {
      max: 10,
      windowMs: 60 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many onboarding attempts — please wait and try again" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const businessNumber = String(body.businessNumber ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const priceQuote =
      typeof body.priceQuote === "string" ? body.priceQuote.trim() : undefined;
    const website = typeof body.website === "string" ? body.website.trim() : undefined;
    const sendSms = body.sendSms === true;

    if (!businessNumber) {
      return NextResponse.json({ error: "businessNumber is required" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const result = await startOnboarding({
      userId,
      businessNumber,
      phone,
      priceQuote,
      website,
      sendSms,
    });

    return NextResponse.json(
      { sessionId: result.sessionId, formUrl: result.formUrl },
      { status: 201 },
    );
  } catch (err) {
    // Grow's own logical failure (status:0) — surface a safe, Grow-provided message.
    if (err instanceof GrowApiError) {
      const status = isBusinessExistsError(err.growErrorId) ? 409 : 422;
      return NextResponse.json(
        { error: err.growMessage ?? "Grow onboarding could not be started", growErrorId: err.growErrorId },
        { status },
      );
    }
    if (err instanceof GrowNetworkError) {
      return NextResponse.json({ error: "Grow is currently unreachable" }, { status: 502 });
    }
    if (err instanceof GrowConfigError) {
      console.error("[POST /api/grow/onboarding/start] config error:", err.message);
      return NextResponse.json({ error: "Onboarding is misconfigured" }, { status: 500 });
    }
    console.error("[POST /api/grow/onboarding/start]", err);
    return NextResponse.json({ error: "Failed to start onboarding" }, { status: 500 });
  }
}
