/**
 * Client-side sessionStorage hand-off for the Grow onboarding flow.
 *
 * The launch page writes { sessionId, formUrl, ts } here, then navigates to the
 * dedicated /settings/payments/grow/onboarding screen which reads it. The formUrl
 * carries a one-time encrypted_lead token, so it is kept OUT of the URL and is
 * NEVER persisted server-side — only in tab-scoped sessionStorage, cleared on
 * success. (Consistent with the decision not to persist encrypted_lead.)
 */

export const GROW_LAUNCH_STORAGE_KEY = "grow_onboarding_launch";
export const GROW_LAUNCH_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export interface GrowLaunchData {
  sessionId: string;
  formUrl: string;
  ts: number;
}

export function writeGrowLaunch(d: { sessionId: string; formUrl: string }): void {
  try {
    sessionStorage.setItem(
      GROW_LAUNCH_STORAGE_KEY,
      JSON.stringify({ sessionId: d.sessionId, formUrl: d.formUrl, ts: Date.now() }),
    );
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

export function readGrowLaunch(): GrowLaunchData | null {
  try {
    const raw = sessionStorage.getItem(GROW_LAUNCH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GrowLaunchData>;
    if (typeof data?.formUrl !== "string" || typeof data?.sessionId !== "string") return null;
    if (typeof data.ts === "number" && Date.now() - data.ts > GROW_LAUNCH_MAX_AGE_MS) return null;
    return { sessionId: data.sessionId, formUrl: data.formUrl, ts: data.ts ?? 0 };
  } catch {
    return null;
  }
}

export function clearGrowLaunch(): void {
  try {
    sessionStorage.removeItem(GROW_LAUNCH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
