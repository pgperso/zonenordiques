import { describe, it, expect, vi, beforeEach } from 'vitest';

// The helper builds a service-role client via `createClient` and calls the
// `consume_rate_limit` RPC. Mock the client so tests drive the RPC response.
const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: mockRpc })),
}));

import { consumeRateLimit, retryAfterSeconds } from '../rateLimit';

describe('retryAfterSeconds', () => {
  it('returns 0 for a null reset', () => {
    expect(retryAfterSeconds(null)).toBe(0);
  });

  it('returns 0 for a reset already in the past', () => {
    expect(retryAfterSeconds(new Date(Date.now() - 5000))).toBe(0);
  });

  it('rounds up the seconds until reset', () => {
    expect(retryAfterSeconds(new Date(Date.now() + 4500))).toBe(5);
  });
});

describe('consumeRateLimit', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  it('fails closed when service-role config is missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await consumeRateLimit('k', 10, 60);

    expect(result.allowed).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('allows a hit within the limit and forwards the right RPC args', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString();
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 9, reset_at: resetAt }],
      error: null,
    });

    const result = await consumeRateLimit('article-gen:user-1', 10, 3600);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt?.toISOString()).toBe(resetAt);
    expect(mockRpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_key: 'article-gen:user-1',
      p_max: 10,
      p_window_seconds: 3600,
    });
  });

  it('denies a hit once the limit is exhausted', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, reset_at: null }],
      error: null,
    });

    const result = await consumeRateLimit('article-gen:user-1', 10, 3600);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('fails closed when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await consumeRateLimit('article-gen:user-1', 10, 3600);

    expect(result.allowed).toBe(false);
  });

  it('fails closed when the client throws', async () => {
    mockRpc.mockRejectedValue(new Error('network down'));

    const result = await consumeRateLimit('article-gen:user-1', 10, 3600);

    expect(result.allowed).toBe(false);
  });

  it('accepts a single-object RPC return as well as a single-row table', async () => {
    mockRpc.mockResolvedValue({
      data: { allowed: true, remaining: 5, reset_at: null },
      error: null,
    });

    const result = await consumeRateLimit('article-gen:user-1', 10, 3600);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});
