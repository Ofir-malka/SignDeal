/**
 * Distributed sliding-window rate limiter backed by Upstash Redis.
 *
 * Falls back to an in-process Map when UPSTASH env vars are absent
 * (local dev, CI, or misconfigured deploy — fails open with a warning).
 *
 * Usage:
 *   const ip = getRealIp(request);
 *   const rl = await rateLimit(ip, "register", { max: 10, windowMs: 3_600_000 });
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { error: "Too many requests — please try again later" },
 *       { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
 *     );
 *   }
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   UPSTASH_REDIS_REST_URL   — from Upstash console → REST API tab
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console → REST API tab
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis }     from "@upstash/redis";

// ── Upstash Redis client (module-level singleton) ─────────────────────────────
// Initialized once on first import. null = env vars absent → in-memory fallback.
let upstashRedis: Redis | null = null;

try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    upstashRedis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } else {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set. " +
      "Rate limits are in-memory only — NOT shared across serverless instances. " +
      "Set both env vars in Vercel for production distributed rate limiting.",
    );
  }
} catch (err) {
  console.warn(
    "[rate-limit] Failed to initialize Upstash Redis — falling back to in-memory:",
    err instanceof Error ? err.message : err,
  );
  upstashRedis = null;
}

// ── Ratelimit instance cache ──────────────────────────────────────────────────
// Keyed by "bucket:max:windowMs" so we reuse the same Ratelimit instance across
// invocations within the same warm serverless container.
const limiterCache = new Map<string, Ratelimit>();

function getUpstashLimiter(
  bucket:   string,
  max:      number,
  windowMs: number,
): Ratelimit {
  const cacheKey = `${bucket}:${max}:${windowMs}`;
  const cached   = limiterCache.get(cacheKey);
  if (cached) return cached;

  // All current limits use whole-minute windows; Math.round is exact for them.
  const minutes = Math.max(1, Math.round(windowMs / 60_000));
  const limiter  = new Ratelimit({
    redis:   upstashRedis!,
    limiter: Ratelimit.slidingWindow(max, `${minutes} m`),
    // Prefix isolates this app's keys from any other data in the same Redis db.
    prefix:  `signdeal:rl:${bucket}`,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

// ── In-memory fallback ────────────────────────────────────────────────────────
// Preserved from the original implementation — used only when Upstash is unavailable.
// NOT shared across serverless instances; resets on cold start.

type Window = { count: number; resetAt: number };

const MAX_ENTRIES     = 10_000;
const inMemoryWindows = new Map<string, Window>();

function inMemoryRateLimit(
  key:    string,
  bucket: string,
  opts:   { max: number; windowMs: number },
): RateLimitResult {
  const now    = Date.now();
  const mapKey = `${bucket}:${key}`;

  // Evict oldest entry when the map is at capacity.
  if (inMemoryWindows.size >= MAX_ENTRIES && !inMemoryWindows.has(mapKey)) {
    const oldest = inMemoryWindows.keys().next().value;
    if (oldest !== undefined) inMemoryWindows.delete(oldest);
  }

  let win = inMemoryWindows.get(mapKey);
  if (!win || now >= win.resetAt) {
    win = { count: 0, resetAt: now + opts.windowMs };
    inMemoryWindows.set(mapKey, win);
  }

  win.count++;

  if (win.count > opts.max) {
    return {
      allowed:    false,
      remaining:  0,
      retryAfter: Math.ceil((win.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: opts.max - win.count };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:     boolean;
  remaining:   number;
  retryAfter?: number;   // seconds until window resets (only when !allowed)
}

/**
 * Check (and increment) the distributed sliding-window rate limit for a key + bucket.
 *
 * Uses Upstash Redis when UPSTASH env vars are set (production / staging).
 * Falls back to an in-process Map when they are absent (local dev / CI).
 *
 * On a Redis error the limiter fails open (allows the request) and logs the error.
 * A brief Redis outage should not lock out all users.
 *
 * @param key       Distinguishes callers — IP address, userId, contractId, email, etc.
 * @param bucket    Names the limit — e.g. "register", "sign-patch", "forgot-password".
 * @param opts.max        Maximum requests allowed in the window.
 * @param opts.windowMs   Window duration in milliseconds (whole-minute granularity).
 */
export async function rateLimit(
  key:    string,
  bucket: string,
  opts:   { max: number; windowMs: number },
): Promise<RateLimitResult> {
  // ── Upstash path ──────────────────────────────────────────────────────────
  if (upstashRedis !== null) {
    try {
      const limiter                       = getUpstashLimiter(bucket, opts.max, opts.windowMs);
      const { success, remaining, reset } = await limiter.limit(key);
      return {
        allowed:    success,
        remaining:  Math.max(0, remaining),
        retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000),
      };
    } catch (err) {
      // Fail open: a brief Redis outage should not lock out all users.
      console.error(
        `[rate-limit] Upstash error bucket="${bucket}" key="${key.slice(0, 32)}" — failing open:`,
        err instanceof Error ? err.message : err,
      );
      return { allowed: true, remaining: opts.max };
    }
  }

  // ── In-memory fallback path ───────────────────────────────────────────────
  return inMemoryRateLimit(key, bucket, opts);
}

/**
 * Extract the caller's real IP from standard Vercel / reverse-proxy headers.
 * Falls back to "unknown" when no IP header is present.
 */
export function getRealIp(request: Request): string {
  const fwd  = (request.headers as Headers).get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();

  const real = (request.headers as Headers).get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}
