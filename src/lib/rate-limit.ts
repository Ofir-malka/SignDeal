/**
 * In-process sliding-window rate limiter.
 *
 * Works correctly within a single serverless instance (Vercel warm container).
 * NOT shared across multiple instances — each cold-start resets the counters.
 * For cross-instance enforcement, add Upstash Redis and swap the Map for
 * Redis INCR + EXPIRE (no changes needed to call sites).
 *
 * Usage:
 *   const ip = getRealIp(request);
 *   const rl = rateLimit(`${ip}`, "register", { max: 10, windowMs: 3_600_000 });
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { error: "Too many requests — please try again later" },
 *       { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
 *     );
 *   }
 */

type Window = { count: number; resetAt: number };

// Module-level Map persists for the lifetime of a warm serverless container.
// A hard limit on entries prevents unbounded growth across thousands of unique IPs.
const MAX_ENTRIES = 10_000;
const windows     = new Map<string, Window>();

export interface RateLimitResult {
  allowed:     boolean;
  remaining:   number;
  retryAfter?: number;   // seconds until the current window resets (only when !allowed)
}

/**
 * Check (and increment) the rate limit for a given key + bucket combination.
 *
 * @param key       Distinguishes individual callers — typically an IP address or contractId.
 * @param bucket    Names the limit being enforced (e.g. "register", "sms-reminder").
 * @param opts.max        Maximum requests allowed in the window.
 * @param opts.windowMs   Window duration in milliseconds.
 */
export function rateLimit(
  key:    string,
  bucket: string,
  opts:   { max: number; windowMs: number },
): RateLimitResult {
  const now    = Date.now();
  const mapKey = `${bucket}:${key}`;

  // Evict oldest entry when the map is at capacity (keeps memory bounded).
  if (windows.size >= MAX_ENTRIES && !windows.has(mapKey)) {
    const oldest = windows.keys().next().value;
    if (oldest !== undefined) windows.delete(oldest);
  }

  let win = windows.get(mapKey);
  if (!win || now >= win.resetAt) {
    win = { count: 0, resetAt: now + opts.windowMs };
    windows.set(mapKey, win);
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

/**
 * Extract the caller's real IP from standard Vercel / reverse-proxy headers.
 * Falls back to "unknown" when no IP header is present.
 */
export function getRealIp(request: Request): string {
  const fwd = (request.headers as Headers).get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();

  const real = (request.headers as Headers).get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}
