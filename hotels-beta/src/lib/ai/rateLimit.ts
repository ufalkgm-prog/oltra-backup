import "server-only";
import { MAX_REQUESTS_PER_USER_PER_DAY } from "./config";

/* Per-user daily cap for the chat route.
 *
 * Deliberately in-memory. On Vercel each serverless instance keeps its own
 * counter, so the real ceiling is (instances × cap) rather than the cap — this
 * is a cost backstop, not a security control. That is an accepted trade while
 * the entire site sits behind the /beta-login gate (CLAUDE.md §36) and the
 * feature is members-only: the population that can reach this route at all is
 * tiny and known.
 *
 * If the site opens to the public, replace the Map with a shared store
 * (Upstash Redis sliding window) — the call sites do not change, only the two
 * functions below. The Anthropic Console spend cap is the true hard stop
 * either way. */

type Bucket = { count: number; resetAt: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const buckets = new Map<string, Bucket>();

/** Bounded so a long-lived instance cannot grow the map without limit. */
const MAX_TRACKED_USERS = 5000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still oversized after sweeping (many active users): drop the entries
  // closest to resetting. Losing a nearly-expired counter costs at most a few
  // extra requests, and is preferable to unbounded growth.
  if (buckets.size > MAX_TRACKED_USERS) {
    const byExpiry = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of byExpiry.slice(0, buckets.size - MAX_TRACKED_USERS)) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/** Records one request against `userId`. Call once per accepted request. */
export function consumeRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(userId);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + DAY_MS };

  if (bucket.count >= MAX_REQUESTS_PER_USER_PER_DAY) {
    buckets.set(userId, bucket);
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  buckets.set(userId, bucket);

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_USER_PER_DAY - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/** Test/diagnostic helper. Not called by the route. */
export function resetRateLimits() {
  buckets.clear();
}
