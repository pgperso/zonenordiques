import { createClient } from '@supabase/supabase-js';

// Distributed fixed-window rate limiting backed by the `rate_limits` table
// and the `consume_rate_limit` RPC (migration 00065). Replaces the old
// per-instance in-memory Map, which on Vercel serverless gave an effective
// ceiling of `limit × instance_count` and reset on every cold start.

export interface RateLimitResult {
  allowed: boolean;
  /** Hits left in the current window (0 once exhausted). */
  remaining: number;
  /** When the current window expires, or null if unknown. */
  resetAt: Date | null;
}

/**
 * Register one hit against `key` and report whether it is within `max` hits
 * per `windowSeconds`.
 *
 * Fails CLOSED: any error (missing config, DB unreachable) returns
 * `allowed: false`. These limiters guard expensive AI calls and a
 * brute-force login surface, so on failure denying is the safe default —
 * and the routes that call this need Supabase anyway, so a Supabase outage
 * already breaks the request regardless of the limiter.
 */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { allowed: false, remaining: 0, resetAt: null };
  }

  try {
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });

    // The RPC returns a single-row table: [{ allowed, remaining, reset_at }].
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      return { allowed: false, remaining: 0, resetAt: null };
    }

    return {
      allowed: row.allowed === true,
      remaining: typeof row.remaining === 'number' ? row.remaining : 0,
      resetAt: row.reset_at ? new Date(row.reset_at) : null,
    };
  } catch {
    return { allowed: false, remaining: 0, resetAt: null };
  }
}

/** Seconds until `resetAt`, floored at 0 — handy for a `Retry-After` header. */
export function retryAfterSeconds(resetAt: Date | null): number {
  if (!resetAt) return 0;
  return Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
}
