/**
 * src/lib/grow/http-client.ts
 *
 * Minimal server-side JSON POST helper for outbound Grow calls. Adds the
 * mandatory User-Agent, enforces a timeout via AbortController, and never logs
 * the request body or headers (they carry the platform key / marketer).
 *
 * NO automatic retry: GetLink is a lead-CREATING call, so a blind retry could
 * mint a duplicate lead. Retries (if ever needed) are a deliberate caller choice.
 */

import { GrowNetworkError } from "./errors";
import { getUserAgent, httpTimeoutMs } from "./config";

export interface GrowHttpResult {
  /** HTTP status code from Grow. */
  status: number;
  /** Parsed JSON body, or null if the body was empty / not JSON. */
  json: unknown;
}

/**
 * POST a JSON body and parse a JSON response. Throws GrowNetworkError on
 * transport failure / timeout / abort. A non-2xx HTTP status is returned (not
 * thrown) so the caller can interpret Grow's logical `{status, err}` envelope.
 */
export async function growPostJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<GrowHttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), httpTimeoutMs());

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": getUserAgent(),
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Never let Next.js cache an onboarding mutation.
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    // Message intentionally carries NO url query / body / headers.
    throw new GrowNetworkError(`Grow request failed (${reason})`);
  } finally {
    clearTimeout(timeout);
  }

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null; // leave null; caller decides how to treat a non-JSON body
    }
  }

  return { status: res.status, json };
}
