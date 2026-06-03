/**
 * src/lib/grow/onboarding/port.ts
 *
 * The STABLE internal contract the routes depend on. The concrete Grow wire
 * details live in adapter.ts; if Grow ever revises the contract, only the
 * adapter changes — this interface and its callers do not.
 */

import type {
  StartOnboardingInput,
  StartOnboardingResult,
  CallbackIngestResult,
} from "./types";

export interface IngestCallbackArgs {
  /** Raw request body text (exactly as received). */
  rawText: string;
  /** Request Content-Type header (used to enforce application/json). */
  contentType: string | null;
  /** Best-effort source IP (audit only). */
  sourceIp: string | null;
  httpMethod: string;
  /** The route's [routeToken] path segment. */
  routeToken: string | undefined;
}

export interface GrowOnboardingPort {
  /** Launch a lead via GetLink and persist a session. */
  startOnboarding(input: StartOnboardingInput): Promise<StartOnboardingResult>;
  /** Ingest one inbound server-update callback (idempotent, retry-safe). */
  ingestCallback(args: IngestCallbackArgs): Promise<CallbackIngestResult>;
  /** The callback URL to hand Grow (ops/runbook); null if base/token unset. */
  getCallbackUrl(): string | null;
}
