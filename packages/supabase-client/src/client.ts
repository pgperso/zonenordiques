import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export function createTribuneClient(supabaseUrl: string, supabaseKey: string) {
  return createClient<Database>(supabaseUrl, supabaseKey);
}

/** @deprecated Use createTribuneClient instead */
export const createArenaClient = createTribuneClient;

export type TribuneClient = ReturnType<typeof createTribuneClient>;
/** @deprecated Use TribuneClient instead */
export type ArenaClient = TribuneClient;
