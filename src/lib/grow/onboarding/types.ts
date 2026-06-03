/**
 * src/lib/grow/onboarding/types.ts
 *
 * Domain types for the Grow onboarding flow (Phase 2B). These are the STABLE
 * internal shapes the rest of the system depends on — the wire formats live
 * behind the adapter and are normalized into these.
 */

/** Result of a successful GetLink launch. */
export interface GetLinkResult {
  /** The hosted registration-form URL (embed in iframe or send via SMS). */
  formUrl: string;
  /**
   * Grow's opaque `encrypted_lead`. NOT persisted in Phase 2B (no Rail-B Layer 2
   * sealing helper for GROW_ONBOARDING_LEAD yet — see implementation report).
   * Kept in-memory only for the duration of the request; never logged.
   */
  encryptedLead: string | null;
  /** tracking_code IF echoed in the GetLink response (doc-inconsistent; often null). */
  trackingCode: string | null;
}

/** Input to start an onboarding session. */
export interface StartOnboardingInput {
  /** SignDeal User.id (the broker). */
  userId: string;
  businessNumber: string;
  phone: string;
  /** Grow `price_quote` (package code). Falls back to GROW_DEFAULT_PRICE_QUOTE. */
  priceQuote?: string;
  website?: string;
  /** Grow `is_send_sms` (send the form link by SMS). Default false. */
  sendSms?: boolean;
  /** Grow `is_direct_debit`. Default 1 (per the onboarding Postman example). */
  isDirectDebit?: number;
}

export interface StartOnboardingResult {
  sessionId: string;
  /** Public onboarding handle (CSPRNG); also the value stored as session.reference. */
  reference: string;
  formUrl: string;
}

/**
 * Normalized onboarding server-update ("callback"), parsed from the
 * application/json body. `apiKey` is held ONLY transiently to seal it into
 * EncryptedSecret — it is never logged or stored in sanitizedPayload.
 */
export interface CanonicalOnboardingUpdate {
  name: string | null;
  phone: string | null;
  /** The broker's Grow clearing id (`user_id`) — the routing anchor. */
  growUserId: string | null;
  packageId: string | null;
  packageName: string | null;
  trackingCode: string | null;
  businessTitle: string | null;
  trackingStatus: { id: string | null; message: string | null } | null;
  /** Top-level `status` ("1" = created). */
  statusRaw: string | null;
  /** SECRET — transient only. The broker's Grow api_key from the callback. */
  apiKey: string | null;
}

/** Outcome of ingesting one inbound callback. `httpStatus` is what we return to Grow. */
export interface CallbackIngestResult {
  httpStatus: number;
  outcome:
    | "stored"
    | "received"
    | "applied"
    | "duplicate"
    | "uncorrelated"
    | "rejected"
    | "deferred"
    | "failed";
  applied: boolean;
  sessionId: string | null;
}
