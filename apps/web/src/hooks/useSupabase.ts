'use client';

import { useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useSupabase() {
  const ref = useRef<ReturnType<typeof createClient> | null>(null);

  const getClient = useCallback(() => {
    if (!ref.current) ref.current = createClient();
    return ref.current;
  }, []);

  return getClient();
}
