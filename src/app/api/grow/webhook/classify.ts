/**
 * src/app/api/grow/webhook/classify.ts — PURE rail classifier for the Grow dispatcher.
 *
 * Grow sends every webhook to ONE flat URL (/api/grow/webhook — fixed in the Grow
 * dashboard, no path token), but two unrelated flows land there:
 *
 *   RAIL A ("saas")    — SignDeal SaaS billing (broker → SignDeal). Every Rail A
 *                        request namespaces cField1: "saas_token_setup:<order>",
 *                        "saas_card_update:<order>", "saas_charge:<chargeId>".
 *   RAIL B ("payment") — client → broker brokerage payments. Rail B sends
 *                        cField1 = Payment.id (a bare cuid — never contains "saas_").
 *
 * Classification rules (deterministic, in order):
 *   R1  cField1 present  → "saas" iff it starts with "saas_", else "payment"
 *                          (a bare id is a POSITIVE Rail B correlation handle).
 *   R2  no cField1       → "saas" iff the payload's merchant userId equals
 *                          GROW_SAAS_USER_ID (secondary signal only; env read is
 *                          safe — unset env simply skips this rule).
 *   R3  default          → "payment" (preserves pre-dispatcher behavior for
 *                          unknown/garbage payloads — the Rail B handler already
 *                          IGNOREs uncorrelated events safely).
 *
 * PURE by contract: no Prisma, no rail imports, never throws. The route is the
 * only file that maps the classification to a handler.
 */

export type GrowCallbackRail = "saas" | "payment";

export interface GrowCallbackClassification {
  rail: GrowCallbackRail;
  /** Which rule decided — for the route's no-secret telemetry log. */
  reason: "cfield1" | "merchant" | "default";
}

export function classifyGrowCallback(
  rawText: string,
  contentType: string | null,
): GrowCallbackClassification {
  try {
    const data = parseLeniently(rawText ?? "", contentType);

    // R1 — cField1 namespace (authoritative when present).
    const cField1 = findField(data, /^cfield1$/i);
    if (cField1 !== null) {
      return cField1.startsWith("saas_")
        ? { rail: "saas", reason: "cfield1" }
        : { rail: "payment", reason: "cfield1" };
    }

    // R2 — merchant identity (secondary; only when cField1 is absent).
    const saasUserId = (process.env.GROW_SAAS_USER_ID ?? "").trim();
    const payloadUserId = findField(data, /^userid$/i);
    if (saasUserId && payloadUserId === saasUserId) {
      return { rail: "saas", reason: "merchant" };
    }
  } catch {
    /* pure contract: any parse surprise falls through to the Rail B default */
  }

  // R3 — default (today's behavior).
  return { rail: "payment", reason: "default" };
}

// ── Lenient parse (mirrors the Rail B webhook-capture approach; no imports) ────

function parseLeniently(body: string, contentType: string | null): unknown {
  if (!body.trim()) return null;
  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) return formToObject(body);

  // No / unexpected content-type → best effort: JSON, then form.
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* fall through */
  }
  return body.includes("=") ? formToObject(body) : null;
}

function formToObject(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

/**
 * Find the first string value whose key matches `re`. Handles BOTH shapes:
 *   JSON  — nested objects/arrays; the leaf KEY is matched directly.
 *   form  — flat bracket keys like "data[customFields][cField1]"; the LAST
 *           bracket segment (or the whole key when unbracketed) is matched.
 */
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
