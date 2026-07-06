/**
 * src/lib/billing/providers/grow/webhook-handler.ts — Rail A SaaS webhook handler.
 *
 * Receives Grow callbacks the dispatcher classified as SaaS-billing ("saas_*"
 * cField1 namespace or SaaS-merchant identity). The webhook is an ACCELERATOR,
 * not a dependency: Rail A remains verify-then-trust POLLING (bridge pages +
 * client pollers), so if Grow never sends these events nothing regresses.
 *
 * Flow: lenient parse → capture WebhookEvent (provider "grow_saas" — its own
 * @@unique(provider,eventId) keyspace, disjoint from Rail B's "grow_payment") →
 * SHADOW-MODE gate (GROW_SAAS_WEBHOOK_ENABLED, default OFF: capture only, never
 * mutate) → sub-route by cField1 namespace:
 *
 *   saas_token_setup:<order>  → verifyAndActivateGrowTokenSetup({ userId })
 *   saas_card_update:<order>  → verifyAndApplyGrowCardUpdate({ userId })
 *   saas_charge:<chargeId>    → IGNORED (the recurring engine already recorded the
 *                               outcome synchronously from createTransactionWithToken)
 *
 * Both verify functions are idempotent + CLAIM-GATED and do their own authoritative
 * getPaymentProcessInfo re-fetch with the SaaS merchant creds — a webhook racing the
 * bridge/poller can never double-apply, and a misrouted event dies at correlation.
 *
 * ALWAYS returns HTTP 200 (after capture): polling is the primary mechanism, so a
 * Grow retry storm buys nothing. No `.reveal()` here (Grow calls happen inside the
 * existing *.http.ts layer). NEVER logs cardToken / processToken / apiKey / payloads.
 *
 * The tiny parse/sanitize/status helpers are deliberately DUPLICATED from Rail B
 * (webhook-capture / webhook-status) rather than shared: lib/billing must not import
 * lib/payments (ESLint rail wall), and the rails stay independently evolvable.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isGrowSaasWebhookEnabled } from "./config";
import { verifyAndActivateGrowTokenSetup } from "./activate";
import { verifyAndApplyGrowCardUpdate } from "./card-update";

export interface SaasCallbackResult {
  httpStatus: number;
  outcome: string;
}

const PROVIDER = "grow_saas";

export async function processGrowSaasCallback(input: {
  rawText: string;
  contentType: string | null;
  sourceIp: string | null;
}): Promise<SaasCallbackResult> {
  const { rawText, contentType } = input;
  const { kind, data } = parseLeniently(rawText ?? "", contentType);

  const cField1 = findField(data, /^cfield1$/i);
  const transactionId = findField(data, /^transactionid$/i);
  // eventId: stable Grow transactionId where available, else a body hash (Rail B idiom).
  const eventId = transactionId ?? createHash("sha256").update(rawText ?? "").digest("hex");

  // ── Capture ALWAYS (shadow mode's whole point): sanitized payload, own keyspace ──
  await storeEvent(eventId, { contentType, kind, callback: sanitize(data) });

  // ── Shadow-mode gate: classification + capture only — NO state mutation ──
  if (!isGrowSaasWebhookEnabled()) {
    return finalize(eventId, "IGNORED", 200, "disabled_shadow_mode");
  }

  try {
    // Merchant-classified events without a cField1 carry nothing actionable.
    if (!cField1) return finalize(eventId, "IGNORED", 200, "no_cfield1");

    const sep = cField1.indexOf(":");
    const namespace = sep === -1 ? cField1 : cField1.slice(0, sep);
    const ref = sep === -1 ? "" : cField1.slice(sep + 1);

    switch (namespace) {
      case "saas_token_setup": {
        const checkout = await findCheckoutByOrder(ref);
        if (!checkout) return finalize(eventId, "IGNORED", 200, "uncorrelated");
        // Existing onboarding bridge logic: idempotent, claim-gated, verify-then-trust.
        const result = await verifyAndActivateGrowTokenSetup({ userId: checkout.userId });
        return mapVerifyState(eventId, result.state, "trial_started");
      }

      case "saas_card_update": {
        const checkout = await findCheckoutByOrder(ref);
        if (!checkout) return finalize(eventId, "IGNORED", 200, "uncorrelated");
        // Existing card-update/recovery bridge logic: idempotent, claim-gated.
        const result = await verifyAndApplyGrowCardUpdate({ userId: checkout.userId });
        return mapVerifyState(eventId, result.state, "applied");
      }

      case "saas_charge":
        // Recurring outcomes are written synchronously by the engine from the
        // createTransactionWithToken response — nothing to apply here.
        return finalize(eventId, "IGNORED", 200, "recurring_recorded_synchronously");

      default:
        return finalize(eventId, "IGNORED", 200, "unknown_saas_namespace");
    }
  } catch (err) {
    // Never 5xx from Rail A (polling covers the flow; retries add nothing).
    console.error(
      `[billing/grow/webhook] handler error eventId=${eventId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return finalize(eventId, "FAILED", 200, "handler_error");
  }
}

// ── Sub-flow helpers ─────────────────────────────────────────────────────────

async function findCheckoutByOrder(order: string): Promise<{ userId: string } | null> {
  if (!order) return null;
  return prisma.billingCheckout.findUnique({ where: { order }, select: { userId: true } });
}

/** Map a verify-function state to the WebhookEvent outcome. `successState` is the
 *  rail-specific success value ("trial_started" for onboarding, "applied" for
 *  card-update/recovery); everything else is a safe non-success (poller's job). */
async function mapVerifyState(
  eventId: string,
  state: string,
  successState: string,
): Promise<SaasCallbackResult> {
  if (state === successState) {
    console.log(`[billing/grow/webhook] ✓ ${successState} eventId=${eventId}`);
    return finalize(eventId, "PROCESSED", 200, successState);
  }
  const outcome = state === "pending" ? "pending" : state === "no_checkout" ? "no_checkout" : "verify_failed";
  return finalize(eventId, "IGNORED", 200, outcome);
}

// ── Capture / status helpers (duplicated from Rail B by design — see docblock) ──

async function storeEvent(eventId: string, payload: object): Promise<void> {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: PROVIDER,
        eventId,
        eventType: "saas_callback",
        payload: JSON.parse(JSON.stringify(payload)),
        status: "RECEIVED",
      },
    });
  } catch (err) {
    // Duplicate (Grow retry) → row exists; idempotency is enforced by the verify
    // functions' claim gates, so just continue. Log other DB errors only.
    const dup =
      typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
    if (!dup) {
      console.error(
        "[billing/grow/webhook] WebhookEvent.create failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

async function finalize(
  eventId: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  httpStatus: number,
  outcome: string,
): Promise<SaasCallbackResult> {
  try {
    // Non-downgrading + race-safe (mirrors Rail B webhook-status): PROCESSED is
    // terminal — a duplicate's IGNORED/FAILED must not overwrite it; the guard is
    // in the WHERE so a late write matches 0 rows instead of clobbering.
    await prisma.webhookEvent.updateMany({
      where:
        status === "PROCESSED"
          ? { provider: PROVIDER, eventId }
          : { provider: PROVIDER, eventId, status: { not: "PROCESSED" } },
      data: { status, error: status === "PROCESSED" ? null : outcome },
    });
  } catch {
    /* non-fatal */
  }
  return { httpStatus, outcome };
}

// ── Lenient parse + sanitize (duplicated from Rail B webhook-capture idiom) ────

const REDACT_KEY = /(token|api[_-]?key|secret|password|cvv|cvc)/i;
const PAN_RUN = /\b\d{13,19}\b/g;
const MAX_STR = 200;

function parseLeniently(
  body: string,
  contentType: string | null,
): { kind: "json" | "form" | "empty" | "unknown"; data: unknown } {
  if (!body.trim()) return { kind: "empty", data: null };
  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      return { kind: "json", data: JSON.parse(body) };
    } catch {
      return { kind: "unknown", data: null };
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    return { kind: "form", data: formToObject(body) };
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") return { kind: "json", data: parsed };
  } catch {
    /* fall through */
  }
  if (body.includes("=")) return { kind: "form", data: formToObject(body) };
  return { kind: "unknown", data: null };
}

function formToObject(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

/** First string value whose key (JSON leaf key, or last bracket segment of a flat
 *  form key like "data[customFields][cField1]") matches `re`. */
function findField(value: unknown, re: RegExp, depth = 0): string | null {
  if (depth > 8 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findField(item, re, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (re.test(lastKeySegment(k)) && typeof v === "string" && v.trim() !== "") return v;
      const found = findField(v, re, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function lastKeySegment(key: string): string {
  const m = key.match(/\[([^\]]*)\]\s*$/);
  return m ? m[1] : key;
}

/** Redact secret VALUES (keys matching token/apiKey/secret/…), mask PAN-like digit
 *  runs, cap string length. Keys are preserved so payload SHAPE stays inspectable. */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[deep]";
  if (typeof value === "string") {
    const masked = value.replace(PAN_RUN, "[redacted-pan]");
    return masked.length > MAX_STR ? masked.slice(0, MAX_STR) + "…" : masked;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}
