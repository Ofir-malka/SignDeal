/**
 * src/lib/grow/errors.ts
 *
 * Typed error surface for the Grow onboarding integration (Phase 2B) + the
 * GetLink error-id catalogue from the onboarding documentation.
 *
 * No secrets ever live in an error message. Codes are stable strings so routes
 * can map them to HTTP status without string-matching messages.
 */

export type GrowErrorCode =
  | "config" // missing / invalid server env
  | "disabled" // feature flag off
  | "network" // transport / timeout reaching Grow
  | "api" // Grow returned a logical failure (GetLink status:0)
  | "callback"; // inbound callback validation problem

export class GrowError extends Error {
  readonly code: GrowErrorCode;
  constructor(code: GrowErrorCode, message: string) {
    super(message);
    this.name = "GrowError";
    this.code = code;
  }
}

export class GrowConfigError extends GrowError {
  constructor(message: string) {
    super("config", message);
    this.name = "GrowConfigError";
  }
}

export class GrowDisabledError extends GrowError {
  constructor(message = "Grow onboarding is disabled (GROW_ONBOARDING_ENABLED is not true)") {
    super("disabled", message);
    this.name = "GrowDisabledError";
  }
}

export class GrowNetworkError extends GrowError {
  constructor(message: string) {
    super("network", message);
    this.name = "GrowNetworkError";
  }
}

/** GetLink returned `{status:0, err:{id,message}}`. */
export class GrowApiError extends GrowError {
  readonly growErrorId: number | null;
  /** Grow's own message (may be Hebrew). Safe to surface — contains no secret. */
  readonly growMessage: string | null;
  constructor(growErrorId: number | null, growMessage: string | null) {
    super("api", `Grow GetLink error${growErrorId != null ? ` (${growErrorId})` : ""}`);
    this.name = "GrowApiError";
    this.growErrorId = growErrorId;
    this.growMessage = growMessage;
  }
}

export class GrowCallbackError extends GrowError {
  constructor(message: string) {
    super("callback", message);
    this.name = "GrowCallbackError";
  }
}

/**
 * GetLink launch error catalogue (onboarding PDF p.5 "שגיאות אפשריות").
 * Used only for operator-facing logging/labels — the broker sees a generic
 * message plus, where safe, Grow's own `err.message`.
 */
export const GETLINK_ERROR_LABELS: Readonly<Record<number, string>> = {
  13: "invalid request",
  17: "invalid marketer / API key",
  115: "invalid parameter",
  117: "invalid parameter",
  120: "invalid parameter",
  121: "invalid parameter",
  142: "invalid parameter",
  143: "invalid parameter",
  145: "invalid parameter",
  149: "business already exists in Meshulam (עסק קיים במשולם)",
  165: "invalid parameter",
};

export function describeGetLinkError(id: number | null): string {
  if (id == null) return "unknown GetLink error";
  return GETLINK_ERROR_LABELS[id] ?? `GetLink error ${id}`;
}

/** True when the GetLink error means "this business is already registered". */
export function isBusinessExistsError(id: number | null): boolean {
  return id === 149;
}
