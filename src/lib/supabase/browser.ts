'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Singleton browser client - Supabase handles token refresh internally. */
export function createSupabaseBrowserClient() {
  client ??= createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return client;
}
