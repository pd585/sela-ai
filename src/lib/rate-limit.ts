/**
 * Lightweight in-memory per-user rate limiter for SELA server functions.
 * Resets windows independently per (userId, action) key.
 */

export type RateLimitAction = "ask" | "process" | "explain" | "translate";

const DEFAULT_LIMITS: Record<RateLimitAction, { max: number; windowMs: number }> = {
  ask: { max: 20, windowMs: 60_000 },
  process: { max: 5, windowMs: 60_000 },
  explain: { max: 20, windowMs: 60_000 },
  translate: { max: 10, windowMs: 60_000 },
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Test helper — clears all buckets. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}

/**
 * Throws a clear Error when the user exceeds the per-action limit.
 * Returns remaining quota on success.
 */
export function assertRateLimit(
  userId: string,
  action: RateLimitAction,
  limits: Record<RateLimitAction, { max: number; windowMs: number }> = DEFAULT_LIMITS,
): { remaining: number; resetAt: number } {
  const rule = limits[action];
  const key = `${userId}:${action}`;
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= rule.max) {
    const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new Error(`Too many ${action} requests. Please wait ${seconds}s and try again.`);
  }

  bucket.count += 1;
  return { remaining: rule.max - bucket.count, resetAt: bucket.resetAt };
}
