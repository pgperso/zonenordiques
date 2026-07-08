import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — bypasses RLS. Server-only; never import into
 * client components. Throws if the environment is misconfigured so a broken
 * deploy fails loudly. Mirrors the inline construction in the cron routes.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuration Supabase (service role) manquante');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
